# WhatsApp Business API — Guía de Configuración

## Resumen

El sistema usa WhatsApp Cloud API (Meta) para notificar al restaurante cuando llega un nuevo pedido. El restaurante puede aceptar o rechazar desde WhatsApp con botones interactivos.

---

## Parte 1: Meta Developer Account

### 1.1 Crear cuenta de desarrollador

1. Ve a https://developers.facebook.com
2. Inicia sesión con tu cuenta de Facebook (o crea una)
3. Click en **"My Apps"** → **"Create App"**
4. Selecciona tipo: **Business**
5. Nombre de la app: `Alamitos Orders` (o el que prefieras)
6. Click **"Create App"**

### 1.2 Agregar producto WhatsApp

1. En el dashboard de la app, busca **"WhatsApp"** en la lista de productos
2. Click **"Set up"**
3. Conecta una **Business Account** (crea una si no tienes)

---

## Parte 2: Configurar número de teléfono

### 2.1 Número de prueba (para desarrollo)

Meta provee un número de prueba gratuito:

1. Ve a **WhatsApp** → **API Setup** en el dashboard
2. Copia el **Phone Number ID** (lo necesitarás)
3. Copia el **Temporary Access Token** (válido 24 horas — para producción usa un token permanente)
4. En **"To"**, agrega el número del restaurante como destinatario de prueba
   - Solo números agregados aquí pueden recibir mensajes en modo desarrollo

### 2.2 Número propio (para producción)

1. Ve a **Phone Numbers** → **Add phone number**
2. Agrega el número real del restaurante
3. Verifica vía código SMS o llamada
4. Solicita acceso a producción (requiere verificación de negocio de Meta — puede tomar días)

---

## Parte 3: Mensaje interactivo vs Template

> ⚠️ **Importante:** El sistema actualmente envía mensajes `interactive` con botones.
> La API de WhatsApp solo permite este tipo de mensaje en respuesta a una conversación
> iniciada por el usuario (ventana de 24 horas).
>
> Para mensajes iniciados por el sistema (como notificaciones de pedidos), **se requiere
> un Template Message aprobado por Meta.**

### 3.1 Crear template de mensaje

1. Ve a **WhatsApp** → **Message Templates** → **Create Template**
2. Configuración:
   - **Category:** `UTILITY`
   - **Name:** `nuevo_pedido` (sin espacios, en minúsculas)
   - **Language:** `es` (Spanish)
3. Cuerpo del mensaje (ejemplo):
   ```
   🆕 NUEVO PEDIDO #{{1}}

   👤 {{2}}
   📱 {{3}}

   {{4}}

   📦 Productos:
   {{5}}

   💰 TOTAL: L. {{6}}

   💳 Comprobante: {{7}}
   ```
4. Agrega botones de respuesta rápida:
   - Botón 1: `✅ Aceptar`
   - Botón 2: `❌ Rechazar`
5. Envía para revisión — Meta aprueba en 24-48 horas

### 3.2 Actualizar el Edge Function para usar template

Una vez aprobado el template, actualiza `supabase/functions/process-order/index.ts`.

Reemplaza el bloque del fetch a WhatsApp con:

```typescript
body: JSON.stringify({
  messaging_product: 'whatsapp',
  to: RESTAURANT_PHONE,
  type: 'template',
  template: {
    name: 'nuevo_pedido',  // nombre exacto del template aprobado
    language: { code: 'es' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: String(orderId).slice(0, 8).toUpperCase() },
          { type: 'text', text: customer_name },
          { type: 'text', text: phone_number },
          { type: 'text', text: delivery_type === 'delivery'
              ? `Zona ID: ${zone_id} | Dir: ${specific_address}`
              : 'PARA RECOGER EN LOCAL' },
          { type: 'text', text: validatedItems.map(i =>
              `x${i.quantity} ${i.name}`).join(', ') },
          { type: 'text', text: String(calculatedTotal) },
          { type: 'text', text: payment_proof_url },
        ]
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '0',
        parameters: [{ type: 'payload', payload: `accept_${orderId}` }]
      },
      {
        type: 'button',
        sub_type: 'quick_reply',
        index: '1',
        parameters: [{ type: 'payload', payload: `reject_${orderId}` }]
      }
    ]
  }
}),
```

---

## Parte 4: Configurar Webhook

El webhook recibe los clicks en los botones de aceptar/rechazar.

### 4.1 Deployar Edge Functions primero

```bash
# Desde la raíz del proyecto
supabase link --project-ref <tu-project-ref>
supabase functions deploy process-order
supabase functions deploy whatsapp-webhook
```

La URL del webhook será:
```
https://<tu-project-ref>.supabase.co/functions/v1/whatsapp-webhook
```

### 4.2 Configurar en Meta

1. Ve a **WhatsApp** → **Configuration** → **Webhook**
2. Click **"Edit"**
3. Callback URL: `https://<tu-project-ref>.supabase.co/functions/v1/whatsapp-webhook`
4. Verify Token: elige una cadena aleatoria segura (ej. `alamitos_webhook_2026`)
5. Click **"Verify and Save"**
6. Suscribe al campo: **messages**

---

## Parte 5: Variables de entorno (Secrets)

### 5.1 Para Edge Functions (producción)

```bash
supabase secrets set WHATSAPP_BUSINESS_PHONE_ID=<phone-number-id-de-meta>
supabase secrets set WHATSAPP_ACCESS_TOKEN=<access-token-de-meta>
supabase secrets set WEBHOOK_VERIFY_TOKEN=<el-verify-token-que-elegiste>
supabase secrets set RESTAURANT_PHONE_NUMBER=<numero-del-restaurante-con-codigo-pais>
```

Formato del número del restaurante: `504XXXXXXXX` (sin +, con código de país Honduras = 504)

### 5.2 Verificar secrets configurados

```bash
supabase secrets list
```

---

## Parte 6: Testing

### 6.1 Test del webhook (verificación)

```bash
curl "https://<tu-project-ref>.supabase.co/functions/v1/whatsapp-webhook\
?hub.mode=subscribe\
&hub.verify_token=<tu-verify-token>\
&hub.challenge=test123"
# Respuesta esperada: test123
```

### 6.2 Test de envío de mensaje (con número de prueba)

```bash
curl -X POST \
  "https://graph.facebook.com/v18.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "<NUMERO_RESTAURANTE>",
    "type": "text",
    "text": { "body": "Test desde Alamitos ✅" }
  }'
```

### 6.3 Test end-to-end

1. Realiza un pedido de prueba en `http://localhost:3000`
2. Verifica que el restaurante recibe el WhatsApp
3. Click en "✅ Aceptar"
4. Verifica que el status en la app cambia a "Confirmado"

---

## Checklist de producción

```
☐ Meta Developer Account creada
☐ WhatsApp Business Account conectada
☐ Número propio verificado
☐ Template "nuevo_pedido" aprobado por Meta
☐ Edge Function actualizada para usar template
☐ Edge Functions deployadas (process-order, whatsapp-webhook)
☐ Secrets configurados en Supabase (4 variables)
☐ Webhook configurado y verificado en Meta
☐ Test de mensaje enviado correctamente
☐ Test de botón aceptar/rechazar funciona
☐ Frontend apuntando a Supabase producción
```

---

## Referencias

- Meta Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
- Message Templates: https://developers.facebook.com/docs/whatsapp/message-templates
- Webhook setup: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
