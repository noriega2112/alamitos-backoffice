import React, { useState } from 'react';
import { Modal, Collapse } from 'react-bootstrap';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { addToCart } from '../../../store/slices/cartSlice';
import { useDrinks } from '../../../queries/useCatalog';
import { PiBeerBottleBold } from 'react-icons/pi';

const AddToCartModal = ({ show, onHide, item, type }) => {
  const dispatch = useDispatch();
  const { data: drinks = [] } = useDrinks();
  const [quantity, setQuantity] = useState(1);
  const [selectedDrinks, setSelectedDrinks] = useState({}); // { [drinkId]: qty }
  const [notes, setNotes] = useState('');
  const [drinksOpen, setDrinksOpen] = useState(false);

  const effectivePrice = item ? (item.sale_price || item.price || 0) : 0;
  const drinksTotal = drinks.reduce((sum, d) => sum + d.price * (selectedDrinks[d.id] || 0), 0);
  const lineTotal = (effectivePrice + drinksTotal) * quantity;

  const isDrinkProduct = item?.categories?.is_drink_category === true;
  const sortedDrinks = [...drinks].sort((a, b) => a.name.localeCompare(b.name));

  const setDrinkQty = (drinkId, qty) => {
    setSelectedDrinks(prev => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[drinkId];
        return next;
      }
      return { ...prev, [drinkId]: qty };
    });
  };

  const handleAdd = () => {
    const drinksPayload = drinks
      .filter(d => selectedDrinks[d.id] > 0)
      .map(d => ({ id: d.id, name: d.name, price: d.price, qty: selectedDrinks[d.id] }));

    dispatch(addToCart({
      type,
      itemId: item.id,
      itemData: item,
      quantity,
      drinks: drinksPayload,
      notes,
    }));
    toast.success(`${item.name} agregado al carrito`);
    setQuantity(1);
    setSelectedDrinks({});
    setNotes('');
    onHide();
  };

  if (!item) return null;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable backdropClassName="modal-backdrop-light">
      <Modal.Header closeButton>
        <Modal.Title>{item.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.name}
            className="img-fluid rounded mb-3"
            style={{ maxHeight: 200, width: '100%', objectFit: 'cover' }}
          />
        )}
        <p className="text-muted">{item.description}</p>

        {/* Price */}
        <div className="mb-3">
          {item.sale_price ? (
            <>
              <span className="text-muted text-decoration-line-through me-2">
                L. {item.price}
              </span>
              <strong className="text-primary fs-5">L. {item.sale_price}</strong>
            </>
          ) : (
            <strong className="text-primary fs-5">L. {item.price}</strong>
          )}
        </div>

        {/* Drinks - hidden for drink-category products */}
        {!isDrinkProduct && drinks.length > 0 && (
          <div className="mb-3" style={{ border: '1px solid var(--primary)', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div
              className="d-flex align-items-center justify-content-between px-3 py-2"
              style={{ cursor: 'pointer', background: 'var(--rgba-primary-1)' }}
              onClick={() => setDrinksOpen(!drinksOpen)}
            >
              <span className="fw-bold" style={{ color: 'var(--primary)' }}><PiBeerBottleBold className="me-1" /> Agregar bebidas</span>
              <i
                className="fa-solid fa-chevron-down text-primary"
                style={{
                  transition: 'transform 0.3s ease',
                  transform: drinksOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              ></i>
            </div>
            <Collapse in={drinksOpen}>
              <div>
                <div className="px-3 py-2">
                  {sortedDrinks.map((drink, idx) => {
                    const qty = selectedDrinks[drink.id] || 0;
                    return (
                      <div
                        key={drink.id}
                        className="d-flex align-items-center justify-content-between py-2"
                        style={idx < sortedDrinks.length - 1 ? { borderBottom: '1px solid #eee' } : {}}
                      >
                        <div>
                          <span className="fw-500">{drink.name}</span>
                          <br />
                          <span className="text-primary small">+L.{drink.price} c/u</span>
                        </div>
                        <div className="quntity">
                          <button type="button" onClick={() => setDrinkQty(drink.id, qty - 1)}>-</button>
                          <input type="text" value={qty} readOnly />
                          <button type="button" onClick={() => setDrinkQty(drink.id, qty + 1)}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Collapse>
          </div>
        )}

        {/* Notes */}
        <div className="mb-3">
          <label className="form-label">Notas para cocina:</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ej: Sin cebolla, término medio..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Quantity */}
        <div className="d-flex align-items-center gap-3 mb-3">
          <label className="form-label mb-0">Cantidad:</label>
          <div className="quntity">
            <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}>-</button>
            <input type="text" value={quantity} readOnly />
            <button type="button" onClick={() => setQuantity(q => q + 1)}>+</button>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-cancel-modal" type="button" onClick={onHide}>Cancelar</button>
        <button className="btn btn-primary" type="button" onClick={handleAdd} style={{ flex: 1 }}>
          Agregar al Carrito — L. {lineTotal.toFixed(2)}
        </button>
      </Modal.Footer>
    </Modal>
  );
};

export default AddToCartModal;
