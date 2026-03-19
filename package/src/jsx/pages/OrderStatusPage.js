import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { supabase } from '../../supabaseClient';
import { clearActiveOrder } from '../../store/slices/orderSlice';

const STATUS_STEPS = [
  { key: 'pending',          label: 'Recibido',    icon: '📋' },
  { key: 'confirmed',        label: 'Confirmado',  icon: '✅' },
  { key: 'preparing',        label: 'Preparando',  icon: '👨‍🍳' },
  { key: 'out_for_delivery', label: 'En Camino',   icon: '🚚' },
  { key: 'delivered',        label: 'Entregado',   icon: '🎉' },
];

const OrderStatusPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch order data
    const fetchOrder = async () => {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();
      if (fetchError) setError(fetchError.message);
      else setOrder(data);
      setLoading(false);
    };
    fetchOrder();

    // Subscribe to real-time status changes
    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(prev => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleNewOrder = () => {
    dispatch(clearActiveOrder());
    navigate('/');
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-5">
        <h4>Pedido no encontrado</h4>
        <p className="text-muted">{error}</p>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>Inicio</button>
      </div>
    );
  }

  const isRejected = order.status === 'rejected';
  const isDelivered = order.status === 'delivered';
  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);

  return (
    <div className="py-4">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div className="card shadow">
            <div className="card-body p-4">
              <h3 className="text-center mb-1">Estado de tu Pedido</h3>
              <p className="text-center text-muted small mb-4">
                #{String(orderId).slice(0, 8).toUpperCase()}
              </p>

              {isRejected ? (
                <div className="text-center py-3">
                  <div style={{ fontSize: 56 }}>❌</div>
                  <h4 className="text-danger mt-3">Pedido Rechazado</h4>
                  <p className="text-muted">El restaurante no pudo procesar tu pedido en este momento.</p>
                  <button className="btn btn-primary mt-3" onClick={handleNewOrder}>
                    Hacer Nuevo Pedido
                  </button>
                </div>
              ) : (
                <>
                  {/* Status Stepper */}
                  <div className="d-flex justify-content-between align-items-start mb-4 position-relative">
                    <div
                      className="position-absolute bg-light"
                      style={{ top: 24, left: '6%', right: '6%', height: 3, zIndex: 0 }}
                    />
                    {STATUS_STEPS.map((step, index) => {
                      const isDone = index <= currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      return (
                        <div
                          key={step.key}
                          className="text-center flex-fill position-relative"
                          style={{ zIndex: 1 }}
                        >
                          <div
                            className={`rounded-circle d-inline-flex align-items-center justify-content-center mb-2 border ${isDone ? 'bg-primary text-white border-primary' : 'bg-white border-secondary text-muted'}`}
                            style={{ width: 48, height: 48, fontSize: 20 }}
                          >
                            {step.icon}
                          </div>
                          <div
                            className={`small ${isCurrent ? 'fw-bold text-primary' : isDone ? 'text-success' : 'text-muted'}`}
                            style={{ fontSize: 11 }}
                          >
                            {step.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Order Details */}
                  <div className="bg-light rounded p-3 mb-3">
                    <div className="row row-cols-2 g-2 small">
                      <div><strong>Cliente:</strong> {order.customer_name}</div>
                      <div><strong>Teléfono:</strong> {order.phone_number}</div>
                      <div>
                        <strong>Entrega:</strong>{' '}
                        {order.delivery_type === 'delivery' ? '🚚 Domicilio' : '🏪 Pickup'}
                      </div>
                      <div><strong>Total:</strong> L. {parseFloat(order.total_amount).toFixed(2)}</div>
                    </div>
                  </div>

                  {isDelivered ? (
                    <div className="text-center mt-3">
                      <p className="text-success fw-bold mb-3">¡Tu pedido fue entregado! 🎉</p>
                      <button className="btn btn-primary" onClick={handleNewOrder}>
                        Hacer Nuevo Pedido
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-muted small mb-0">
                      Esta página se actualiza automáticamente
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderStatusPage;
