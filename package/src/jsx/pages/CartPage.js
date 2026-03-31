import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  selectCartItems,
  selectCartSubtotal,
  removeFromCart,
  updateQuantity,
  updateItemDrinks,
} from '../../store/slices/cartSlice';
import { PiBeerBottleBold, PiNotepadBold } from 'react-icons/pi';
import EmptyCart from '../components/EmptyCart';
import { useBusinessHours } from '../../queries/useBusinessHours';
import ClosedModal from '../components/BusinessHours/ClosedModal';

const CartPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartSubtotal);

  const { data: hoursData } = useBusinessHours();
  const isOpen = hoursData?.isOpen ?? true;
  const schedule = hoursData?.schedule ?? [];
  const [showClosedModal, setShowClosedModal] = useState(false);

  const handleDrinkQty = (itemId, drinks, drinkId, delta) => {
    const updated = drinks
      .map((d) => (d.id === drinkId ? { ...d, qty: Math.max(0, (d.qty || 1) + delta) } : d))
      .filter((d) => d.qty > 0);
    dispatch(updateItemDrinks({ id: itemId, drinks: updated }));
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
            <h4 className="mb-0">Volver al menu</h4>
          </button>
        </div>
      </div>
      <div className="row">
        {/* Product list */}
        <div className="col-lg-8">
          <div className="card dlab-bg">
            <div className="card-body pt-0 pb-2">
              {items.map((item) => {
                const unitPrice = item.itemData.sale_price || item.itemData.price;
                const drinksTotal = (item.drinks || []).reduce((s, d) => s + d.price * (d.qty || 1), 0);
                const lineTotal = (unitPrice + drinksTotal) * item.quantity;
                return (
                  <div key={item.id} className="order-check d-flex align-items-center my-3">
                    <div className="dlab-info">
                      <div className="d-flex align-items-center justify-content-between">
                        <h4 className="dlab-title mb-0">{item.itemData.name}</h4>
                        <h4 className="text-primary ms-2 mb-0">L. {lineTotal.toFixed(2)}</h4>
                      </div>
                      {item.notes && (
                        <p className="text-muted small mb-1 mt-1">
                          <PiNotepadBold className="me-1" /> {item.notes}
                        </p>
                      )}
                      <div className="d-flex align-items-center justify-content-between mt-1">
                        <span className="text-muted small">
                          L. {unitPrice.toFixed(2)}
                          {drinksTotal > 0 && ` + L. ${drinksTotal.toFixed(2)} bebidas`}
                        </span>
                        <div className="d-flex align-items-center gap-2">
                          <div className="quntity">
                            <button
                              onClick={() =>
                                dispatch(updateQuantity({ id: item.id, quantity: Math.max(1, item.quantity - 1) }))
                              }
                            >
                              -
                            </button>
                            <input type="text" value={item.quantity} readOnly />
                            <button
                              onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }))}
                            >
                              +
                            </button>
                          </div>
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-1"
                            onClick={() => dispatch(removeFromCart(item.id))}
                            title="Eliminar"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Drinks with inline qty editing */}
                      {item.drinks && item.drinks.length > 0 && (
                        <div className="mt-2">
                          {item.drinks.map((d) => (
                            <div key={d.id} className="d-flex align-items-center justify-content-between mb-1">
                              <span className="text-muted small">
                                <PiBeerBottleBold className="me-1" /> {d.name}{' '}
                                <span className="text-primary">L.{d.price} c/u</span>
                              </span>
                              <div className="quntity" style={{ transform: 'scale(0.85)' }}>
                                <button onClick={() => handleDrinkQty(item.id, item.drinks, d.id, -1)}>-</button>
                                <input type="text" value={d.qty || 1} readOnly />
                                <button onClick={() => handleDrinkQty(item.id, item.drinks, d.id, 1)}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <hr className="my-2 text-primary" style={{ opacity: '0.9' }} />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="col-lg-4">
          <div className="card dlab-bg dlab-position">
            <div className="card-header border-0 pb-0">
              <h4 className="cate-title">Resumen</h4>
            </div>
            <div className="card-body pt-0 pb-2">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span>Subtotal</span>
                <h5 className="font-w500 mb-0">L. {subtotal.toFixed(2)}</h5>
              </div>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-muted small">Delivery</span>
                <span className="text-muted small">Se calcula en checkout</span>
              </div>
              <hr className="my-2 text-primary" style={{ opacity: '0.9' }} />
            </div>
            <div className="card-footer pt-0 border-0">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h4 className="font-w500 mb-0">Total</h4>
                <h3 className="font-w500 text-primary mb-0">L. {subtotal.toFixed(2)}</h3>
              </div>
              <button
                className="btn btn-primary btn-block w-100"
                onClick={() => {
                  if (!isOpen) {
                    setShowClosedModal(true);
                    return;
                  }
                  navigate('/checkout');
                }}
              >
                Proceder al Checkout
              </button>
            </div>
          </div>
        </div>
      </div>
      <ClosedModal show={showClosedModal} onHide={() => setShowClosedModal(false)} schedule={schedule} />
    </div>
  );
};

export default CartPage;
