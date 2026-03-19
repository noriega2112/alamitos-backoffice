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

    if (message?.type === 'interactive') {
      const buttonId: string = message.interactive?.button_reply?.id ?? '';

      if (buttonId) {
        // Button ID format: 'accept_{orderId}' or 'reject_{orderId}'
        const underscoreIndex = buttonId.indexOf('_');
        const action = buttonId.slice(0, underscoreIndex);         // 'accept' or 'reject'
        const orderId = buttonId.slice(underscoreIndex + 1);       // UUID

        const newStatus = action === 'accept' ? 'confirmed' : 'rejected';

        const { error } = await supabase
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId);

        if (error) {
          console.error(`Failed to update order ${orderId} to ${newStatus}:`, error);
        } else {
          console.log(`Order ${orderId} updated to ${newStatus}`);
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
