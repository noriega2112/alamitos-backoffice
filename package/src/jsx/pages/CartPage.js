import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  selectCartItems,
  selectCartSubtotal,
  removeFromCart,
  updateQuantity,
} from '../../store/slices/cartSlice';

const TAX_RATE = 0.15;

const CartPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);
  const taxAmount = subtotal * TAX_RATE;

  if (items.length === 0) {
    return (
      <div className="text-center py-5">
        <p style={{ fontSize: 48 }}>🛒</p>
        <h4>Tu carrito está vacío</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>
          Ver Menú
        </button>
      </div>
    );
  }

  return (
    <div className="py-4">
      <h3 className="mb-4">Tu Pedido</h3>
      <div className="row">
        <div className="col-lg-8">
          {items.map(item => {
            const unitPrice = item.itemData.sale_price || item.itemData.price;
            const drinksTotal = (item.drinks || []).reduce((s, d) => s + d.price, 0);
            const lineTotal = (unitPrice + drinksTotal) * item.quantity;
            return (
              <div key={item.id} className="card mb-3 shadow-sm">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="flex-grow-1">
                      <h5 className="mb-1">{item.itemData.name}</h5>
                      {item.drinks && item.drinks.length > 0 && (
                        <p className="text-muted small mb-1">
                          🥤 {item.drinks.map(d => d.name).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-muted small mb-1">📝 {item.notes}</p>
                      )}
                      <p className="mb-0 small">
                        L. {unitPrice}
                        {drinksTotal > 0 && <span className="text-muted"> + L. {drinksTotal} bebidas</span>}
                      </p>
                    </div>
                    <button
                      className="btn btn-sm btn-outline-danger ms-2"
                      onClick={() => dispatch(removeFromCart(item.id))}
                      title="Eliminar"
                    >✕</button>
                  </div>
                  <div className="d-flex align-items-center gap-2 mt-3">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: Math.max(1, item.quantity - 1) }))}
                    >−</button>
                    <span className="fw-bold px-2">{item.quantity}</span>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                    >+</button>
                    <span className="ms-auto fw-bold text-primary">L. {lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="col-lg-4">
          <div className="card shadow-sm sticky-top" style={{ top: 20 }}>
            <div className="card-body">
              <h5 className="mb-3">Resumen</h5>
              <ul className="list-unstyled">
                <li className="d-flex justify-content-between mb-2">
                  <span>Subtotal</span>
                  <span>L. {subtotal.toFixed(2)}</span>
                </li>
                <li className="d-flex justify-content-between mb-2">
                  <span>ISV (15%)</span>
                  <span>L. {taxAmount.toFixed(2)}</span>
                </li>
                <li className="d-flex justify-content-between mb-2 text-muted small">
                  <span>Delivery</span>
                  <span>Se calcula en checkout</span>
                </li>
              </ul>
              <hr />
              <div className="d-flex justify-content-between fw-bold fs-5 mb-3">
                <span>Total (sin delivery)</span>
                <span>L. {(subtotal + taxAmount).toFixed(2)}</span>
              </div>
              <button
                className="btn btn-primary w-100"
                onClick={() => navigate('/checkout')}
              >
                Proceder al Checkout →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
