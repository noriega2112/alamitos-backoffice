import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useZones } from '../../queries/useZones';
import { selectCartItems, selectCartSubtotal, clearCart } from '../../store/slices/cartSlice';
import { setActiveOrder } from '../../store/slices/orderSlice';
import { supabase } from '../../supabaseClient';

const TAX_RATE = 0.15;

const CheckoutPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const { data: zones = [] } = useZones();

  const [deliveryType, setDeliveryType] = useState('delivery');
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [specificAddress, setSpecificAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentFile, setPaymentFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selectedZone = zones.find((z) => z.id === Number.parseInt(selectedZoneId, 10));
  const deliveryFee = deliveryType === 'delivery' ? selectedZone?.delivery_fee || 0 : 0;
  const taxAmount = subtotal * TAX_RATE;
  const totalAmount = subtotal + deliveryFee + taxAmount;

  const validate = () => {
    if (!customerName.trim()) return 'Nombre requerido';
    if (!/^\d{8}$/.test(phoneNumber.replaceAll('-', '').replaceAll(' ', ''))) return 'Teléfono debe tener 8 dígitos';
    if (deliveryType === 'delivery' && !selectedZoneId) return 'Selecciona una zona de entrega';
    if (deliveryType === 'delivery' && !specificAddress.trim()) return 'Dirección específica requerida';
    if (!paymentFile) return 'Debes subir el comprobante de pago';
    if (items.length === 0) return 'Tu carrito está vacío';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Upload payment proof to Supabase Storage
      const fileExt = paymentFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payments')
        .upload(fileName, paymentFile);
      if (uploadError) throw new Error(`Error subiendo comprobante: ${uploadError.message}`);

      const {
        data: { publicUrl },
      } = supabase.storage.from('payments').getPublicUrl(uploadData.path);

      // 2. Build items payload
      const orderItems = items.map((item) => ({
        product_id: item.type === 'product' ? item.itemId : null,
        promotion_id: item.type === 'promotion' ? item.itemId : null,
        quantity: item.quantity,
        unit_price: item.itemData.sale_price || item.itemData.price,
        notes: item.notes || '',
        drinks: (item.drinks || []).map((d) => d.id),
      }));

      // 3. Invoke Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('process-order', {
        body: {
          customer_name: customerName.trim(),
          phone_number: phoneNumber.replaceAll('-', '').replaceAll(' ', ''),
          delivery_type: deliveryType,
          zone_id: deliveryType === 'delivery' ? Number.parseInt(selectedZoneId, 10) : null,
          specific_address: deliveryType === 'delivery' ? specificAddress.trim() : null,
          notes: orderNotes.trim(),
          subtotal: Math.round(subtotal * 100) / 100,
          delivery_fee: Math.round(deliveryFee * 100) / 100,
          tax_amount: Math.round(taxAmount * 100) / 100,
          total_amount: Math.round(totalAmount * 100) / 100,
          payment_proof_url: publicUrl,
          items: orderItems,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.order_id) throw new Error('No se recibió confirmación del pedido');

      // 4. Save to Redux + localStorage, clear cart
      dispatch(setActiveOrder({ orderId: data.order_id, status: 'pending' }));
      dispatch(clearCart());

      // 5. Navigate to status page
      navigate(`/status/${data.order_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-5">
        <h4>Tu carrito está vacío</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>
          Ver Menú
        </button>
      </div>
    );
  }

  return (
    <div className="py-4">
      <h3 className="mb-4">Checkout</h3>
      {error && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} />
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-lg-8">
            {/* Delivery Type */}
            <div className="card mb-3 shadow-sm">
              <div className="card-body">
                <h5 className="card-title">Tipo de entrega</h5>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="radio"
                    id="delivery"
                    value="delivery"
                    checked={deliveryType === 'delivery'}
                    onChange={(e) => setDeliveryType(e.target.value)}
                  />
                  <label className="form-check-label" htmlFor="delivery">
                    🚚 Entrega a domicilio
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    id="pickup"
                    value="pickup"
                    checked={deliveryType === 'pickup'}
                    onChange={(e) => setDeliveryType(e.target.value)}
                  />
                  <label className="form-check-label" htmlFor="pickup">
                    🏪 Pasar recogiendo
                  </label>
                </div>

                {/* Customer Info */}
                <h5 className="card-title">Tus datos</h5>
                <div className="mb-3">
                  <label className="form-label" htmlFor="customerName">
                    Nombre completo *
                  </label>
                  <input
                    id="customerName"
                    type="text"
                    className="form-control"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Juan Pérez"
                  />
                </div>
                <div className="mb-0">
                  <label className="form-label" htmlFor="phoneNumber">
                    Teléfono (8 dígitos) *
                  </label>
                  <input
                    id="phoneNumber"
                    type="tel"
                    className="form-control"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="9999-9999"
                  />
                </div>
              </div>
            </div>

            {/* Delivery Info */}
            {deliveryType === 'delivery' && (
              <div className="card mb-3 shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">Dirección de entrega</h5>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="zone">
                      Zona *
                    </label>
                    <select
                      id="zone"
                      className="form-select"
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                    >
                      <option value="">Selecciona tu zona...</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name} — L. {zone.delivery_fee} delivery
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-0">
                    <label className="form-label" htmlFor="address">
                      Dirección específica *
                    </label>
                    <textarea
                      id="address"
                      className="form-control"
                      rows={3}
                      value={specificAddress}
                      onChange={(e) => setSpecificAddress(e.target.value)}
                      placeholder="Barrio, calle, número de casa, referencia cercana..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="card mb-3 shadow-sm">
              <div className="card-body">
                <label className="form-label" htmlFor="notes">
                  Notas adicionales (opcional)
                </label>
                <textarea
                  id="notes"
                  className="form-control"
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Instrucciones especiales para el pedido..."
                />
              </div>
            </div>

            {/* Payment Proof */}
            <div className="card mb-3 shadow-sm">
              <div className="card-body">
                <h5 className="card-title">Comprobante de pago *</h5>
                <p className="text-muted small mb-3">
                  Realiza la transferencia bancaria y sube la captura de pantalla del comprobante.
                </p>
                <input
                  type="file"
                  className="form-control"
                  accept="image/*"
                  onChange={(e) => setPaymentFile(e.target.files[0])}
                />
                {paymentFile && <p className="text-success small mt-2 mb-0">✓ {paymentFile.name}</p>}
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="col-lg-4">
            <div className="card shadow-sm sticky-top" style={{ top: 20 }}>
              <div className="card-body">
                <h5 className="mb-3">Tu pedido</h5>
                {items.map((item) => (
                  <div key={item.id} className="d-flex justify-content-between mb-2 small">
                    <span className="text-truncate me-2">
                      {item.itemData.name} ×{item.quantity}
                    </span>
                    <span className="text-nowrap">
                      L. {(((item.itemData.sale_price || item.itemData.price) + (item.drinks || []).reduce((s, d) => s + d.price, 0)) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
                <hr />
                <ul className="list-unstyled mb-0">
                  <li className="d-flex justify-content-between mb-2">
                    <span>Subtotal</span>
                    <span>L. {subtotal.toFixed(2)}</span>
                  </li>
                  {deliveryType === 'delivery' && (
                    <li className="d-flex justify-content-between mb-2">
                      <span>Delivery</span>
                      <span>{selectedZone ? `L. ${Number(deliveryFee).toFixed(2)}` : '—'}</span>
                    </li>
                  )}
                  <li className="d-flex justify-content-between mb-2">
                    <span>ISV (15%)</span>
                    <span>L. {taxAmount.toFixed(2)}</span>
                  </li>
                  <hr />
                  <li className="d-flex justify-content-between fw-bold fs-5">
                    <span>Total</span>
                    <span>L. {totalAmount.toFixed(2)}</span>
                  </li>
                </ul>
                <button type="submit" className="btn btn-primary w-100 mt-3" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                      Procesando...
                    </>
                  ) : (
                    '🛍️ Realizar Pedido'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CheckoutPage;
