import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 3600000; // 1 hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    const {
      customer_name, phone_number, delivery_type, zone_id, specific_address,
      notes, payment_proof_url, items, subtotal, delivery_fee, tax_amount, total_amount
    } = payload;

    // 1. Validate required fields
    if (!customer_name || !phone_number || !payment_proof_url || !items?.length) {
      throw new Error('Campos requeridos faltantes');
    }

    // 2. Rate limiting
    const oneHourAgo = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('phone_number', phone_number)
      .gte('created_at', oneHourAgo);
    if ((count ?? 0) >= RATE_LIMIT) {
      throw new Error('Límite de pedidos excedido. Intenta en 1 hora.');
    }

    // 3. Re-validate prices from DB (never trust frontend)
    let calculatedSubtotal = 0;
    for (const item of items) {
      const table = item.product_id ? 'products' : 'promotions';
      const id = item.product_id ?? item.promotion_id;
      const { data: record, error } = await supabase
        .from(table)
        .select('price, sale_price')
        .eq('id', id)
        .single();
      if (error || !record) throw new Error(`Ítem no encontrado: ${id}`);
      const effectivePrice = record.sale_price || record.price;
      calculatedSubtotal += effectivePrice * item.quantity;

      // Add drinks to subtotal
      if (item.drinks?.length) {
        for (const drinkId of item.drinks) {
          const { data: drink } = await supabase
            .from('drinks')
            .select('price')
            .eq('id', drinkId)
            .eq('is_active', true)
            .single();
          if (drink) calculatedSubtotal += drink.price * item.quantity;
        }
      }
    }

    // 4. Validate delivery fee from DB
    let calculatedDeliveryFee = 0;
    if (delivery_type === 'delivery' && zone_id) {
      const { data: zone } = await supabase
        .from('zones')
        .select('delivery_fee')
        .eq('id', zone_id)
        .eq('is_active', true)
        .single();
      calculatedDeliveryFee = Number(zone?.delivery_fee ?? 0);
    }

    const calculatedTax = Math.round(calculatedSubtotal * 0.15 * 100) / 100;
    const calculatedTotal = Math.round((calculatedSubtotal + calculatedDeliveryFee + calculatedTax) * 100) / 100;

    // Allow small floating point difference (max 0.02)
    if (Math.abs(calculatedTotal - total_amount) > 0.02) {
      throw new Error(`Total no coincide. Esperado: ${calculatedTotal}, Recibido: ${total_amount}`);
    }

    // 5. Create order via stored procedure (atomic transaction)
    const { data: orderResult, error: orderError } = await supabase.rpc('create_order', {
      p_customer_name: customer_name,
      p_phone_number: phone_number,
      p_delivery_type: delivery_type,
      p_zone_id: zone_id ?? null,
      p_specific_address: specific_address ?? null,
      p_subtotal: Math.round(calculatedSubtotal * 100) / 100,
      p_delivery_fee: calculatedDeliveryFee,
      p_tax_amount: calculatedTax,
      p_total_amount: calculatedTotal,
      p_payment_proof_url: payment_proof_url,
      p_notes: notes ?? '',
      p_items: JSON.stringify(items),
    });

    if (orderError) throw new Error(`Error creando orden: ${orderError.message}`);
    const orderId = Array.isArray(orderResult) ? orderResult[0]?.id : orderResult?.id;
    if (!orderId) throw new Error('No se obtuvo ID de orden');

    // 6. Send WhatsApp notification (non-blocking — failure does NOT fail the order)
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_BUSINESS_PHONE_ID');
    const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const RESTAURANT_PHONE = Deno.env.get('RESTAURANT_PHONE_NUMBER');

    if (WHATSAPP_PHONE_ID && WHATSAPP_TOKEN && RESTAURANT_PHONE) {
      try {
        const deliveryInfo = delivery_type === 'delivery'
          ? `📍 Zona ID: ${zone_id}\n🏠 Dirección: ${specific_address}`
          : `🏪 PARA RECOGER EN LOCAL`;

        const itemsSummary = items.map((item: { product_id: number | null; promotion_id: number | null; quantity: number; drinks?: number[]; notes?: string }) => {
          const label = item.product_id ? `Producto #${item.product_id}` : `Promo #${item.promotion_id}`;
          const drinks = item.drinks?.length ? ` + bebidas: [${item.drinks.join(', ')}]` : '';
          const note = item.notes ? ` (${item.notes})` : '';
          return `• x${item.quantity} ${label}${drinks}${note}`;
        }).join('\n');

        await fetch(
          `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: RESTAURANT_PHONE,
              type: 'interactive',
              interactive: {
                type: 'button',
                body: {
                  text: `🆕 NUEVO PEDIDO #${String(orderId).slice(0, 8).toUpperCase()}\n\n👤 ${customer_name}\n📱 ${phone_number}\n\n${deliveryInfo}\n\n📦 Productos:\n${itemsSummary}\n\n💰 Subtotal: L. ${calculatedSubtotal}\n🚚 Delivery: L. ${calculatedDeliveryFee}\n📊 ISV: L. ${calculatedTax}\n✅ TOTAL: L. ${calculatedTotal}\n\n💳 Comprobante: ${payment_proof_url}`,
                },
                action: {
                  buttons: [
                    { type: 'reply', reply: { id: `accept_${orderId}`, title: '✅ Aceptar' } },
                    { type: 'reply', reply: { id: `reject_${orderId}`, title: '❌ Rechazar' } },
                  ],
                },
              },
            }),
          }
        );
      } catch (whatsappError) {
        console.error('WhatsApp notification failed:', whatsappError);
        // Mark in notes but do NOT fail the order
        await supabase
          .from('orders')
          .update({ notes: `WHATSAPP_FAILED | ${notes ?? ''}` })
          .eq('id', orderId);
      }
    }

    return new Response(
      JSON.stringify({ order_id: orderId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('process-order error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
