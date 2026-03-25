import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useZones } from '../../queries/useZones';
import { selectCartItems, selectCartSubtotal, clearCart } from '../../store/slices/cartSlice';
import { setActiveOrder } from '../../store/slices/orderSlice';
import { supabase } from '../../supabaseClient';
import EmptyCart from '../components/EmptyCart';

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

  const selectedZone = zones.find((z) => z.id === Number.parseInt(selectedZoneId, 10));
  const deliveryFee = deliveryType === 'delivery' ? selectedZone?.delivery_fee || 0 : 0;
  const totalAmount = subtotal + deliveryFee;

  // JS-based sticky for the summary card (CSS sticky broken by ancestor overflow:hidden)
  const summaryColRef = useRef(null);
  const summaryCardRef = useRef(null);
  const isFixedRef = useRef(false);
  const naturalWidthRef = useRef(0);
  const naturalHeightRef = useRef(0);

  useEffect(() => {
    const col = summaryColRef.current;
    const card = summaryCardRef.current;
    if (!col || !card) return;

    const handleScroll = () => {
      if (window.innerWidth < 992) {
        if (isFixedRef.current) {
          card.style.cssText = '';
          col.style.minHeight = '';
          isFixedRef.current = false;
        }
        return;
      }

      if (!isFixedRef.current) {
        naturalWidthRef.current = card.offsetWidth;
        naturalHeightRef.current = card.offsetHeight;
      }

      const headerEl = document.querySelector('.header');
      const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
      const colRect = col.getBoundingClientRect();
      const topOffset = headerH + 16;

      if (colRect.top < topOffset && !isFixedRef.current) {
        col.style.minHeight = naturalHeightRef.current + 'px';
        card.style.position = 'fixed';
        card.style.top = topOffset + 'px';
        card.style.left = colRect.left + 'px';
        card.style.width = naturalWidthRef.current + 'px';
        card.style.height = naturalHeightRef.current + 'px';
        card.style.zIndex = '10';
        isFixedRef.current = true;
      } else if (colRect.top >= topOffset && isFixedRef.current) {
        card.style.cssText = '';
        col.style.minHeight = '';
        isFixedRef.current = false;
      }
    };

    const handleResize = () => {
      if (isFixedRef.current) {
        card.style.cssText = '';
        col.style.minHeight = '';
        isFixedRef.current = false;
      }
      handleScroll();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);

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
          tax_amount: 0,
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
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return <EmptyCart />;
  }

  return (
    <div className="py-4">
      <div className="card-header border-0 pb-0">
        <div className="folder-tab">
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
              font: 'inherit',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <i className="fa-solid fa-arrow-left me-2"></i>
            <h4 className="mb-0">Ir atras</h4>
          </button>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-lg-8">
            {/* Delivery Type */}
            <div className="card dlab-bg">
              <div className="card-body">
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
                </div>

                {/* Customer Info */}
                <div className="card-body">
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
                {/* Delivery Info */}
                {deliveryType === 'delivery' && (
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
                )}
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
                {/* Payment Proof */}
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
          </div>

          {/* Order Summary */}
          <div className="col-lg-4" ref={summaryColRef} style={{ alignSelf: 'flex-start' }}>
            <div className="card dlab-bg" ref={summaryCardRef}>
              <div className="card-body">
                <h4 className="cate-title mb-3">Tu pedido</h4>
                {items.map((item) => (
                  <div key={item.id} className="d-flex justify-content-between mb-2 small">
                    <span className="text-truncate me-2">
                      {item.itemData.name} ×{item.quantity}
                    </span>
                    <span className="text-nowrap">
                      L.{' '}
                      {(
                        ((item.itemData.sale_price || item.itemData.price) +
                          (item.drinks || []).reduce((s, d) => s + d.price * (d.qty || 1), 0)) *
                        item.quantity
                      ).toFixed(2)}
                    </span>
                  </div>
                ))}
                <hr className="my-2 text-primary" style={{ opacity: '0.9' }} />
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span>Subtotal</span>
                  <h5 className="font-w500 mb-0">L. {subtotal.toFixed(2)}</h5>
                </div>
                {deliveryType === 'delivery' && (
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span>Delivery</span>
                    <h5 className="font-w500 mb-0">{selectedZone ? `L. ${Number(deliveryFee).toFixed(2)}` : '—'}</h5>
                  </div>
                )}
                <hr className="my-2 text-primary" style={{ opacity: '0.9' }} />
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h4 className="font-w500 mb-0">Total</h4>
                  <h3 className="font-w500 text-primary mb-0">L. {totalAmount.toFixed(2)}</h3>
                </div>
                <button type="submit" className="btn btn-primary btn-block w-100" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Procesando...
                    </>
                  ) : (
                    'Realizar Pedido'
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
