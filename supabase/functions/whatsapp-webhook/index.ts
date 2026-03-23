import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // GET: Meta webhook verification handshake
  if (req.method === 'GET') {
    const WEBHOOK_VERIFY_TOKEN = Deno.env.get('WEBHOOK_VERIFY_TOKEN');
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // POST: Handle incoming webhook events from WhatsApp
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();

    // Extract message from WhatsApp webhook payload structure
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) {
      return new Response('OK', { status: 200 });
    }

    // Handle quick reply button presses from the template
    // Meta sends button replies with context.id = wamid of the original template
    const repliedToWamid = message.context?.id;

    if (repliedToWamid && message.type === 'button') {
      const buttonText: string = (message.button?.text ?? '').toLowerCase();

      // Find the order that matches this WhatsApp message ID
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('whatsapp_message_id', repliedToWamid)
        .single();

      if (fetchError || !order) {
        console.error(`No order found for wamid ${repliedToWamid}:`, fetchError);
      } else if (order.status === 'pending') {
        const newStatus = buttonText === 'rechazar' ? 'rejected' : 'preparing';

        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', order.id);

        if (error) {
          console.error(`Failed to update order ${order.id} to ${newStatus}:`, error);
        } else {
          console.log(`Order ${order.id} → ${newStatus} via WhatsApp button`);
        }
      }
    }

    // Always return 200 to WhatsApp to acknowledge receipt
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('whatsapp-webhook error:', error);
    // Always return 200 — WhatsApp will retry on non-200 responses
    return new Response('OK', { status: 200 });
  }
});
