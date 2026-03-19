import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useDispatch } from 'react-redux';
import { addToCart } from '../../../store/slices/cartSlice';
import { useDrinks } from '../../../queries/useCatalog';

const AddToCartModal = ({ show, onHide, item, type }) => {
  // item: product or promotion object
  // type: 'product' | 'promotion'
  const dispatch = useDispatch();
  const { data: drinks = [] } = useDrinks();
  const [quantity, setQuantity] = useState(1);
  const [selectedDrinks, setSelectedDrinks] = useState([]);
  const [notes, setNotes] = useState('');

  const effectivePrice = item ? (item.sale_price || item.price || 0) : 0;
  const drinksTotal = selectedDrinks.reduce((sum, d) => sum + d.price, 0);
  const lineTotal = (effectivePrice + drinksTotal) * quantity;

  const toggleDrink = (drink) => {
    setSelectedDrinks(prev =>
      prev.find(d => d.id === drink.id)
        ? prev.filter(d => d.id !== drink.id)
        : [...prev, drink]
    );
  };

  const handleAdd = () => {
    dispatch(addToCart({
      type,
      itemId: item.id,
      itemData: item,
      quantity,
      drinks: selectedDrinks,
      notes,
    }));
    setQuantity(1);
    setSelectedDrinks([]);
    setNotes('');
    onHide();
  };

  if (!item) return null;

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
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

        {/* Drinks */}
        {drinks.length > 0 && (
          <div className="mb-3">
            <p className="fw-bold mb-2">Agregar bebidas:</p>
            <div className="d-flex flex-wrap gap-2">
              {drinks.map(drink => (
                <button
                  key={drink.id}
                  type="button"
                  className={`btn btn-sm ${selectedDrinks.find(d => d.id === drink.id) ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => toggleDrink(drink)}
                >
                  {drink.name} +L.{drink.price}
                </button>
              ))}
            </div>
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
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-outline-secondary btn-sm"
              type="button"
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
            >-</button>
            <span className="px-3 fw-bold">{quantity}</span>
            <button
              className="btn btn-outline-secondary btn-sm"
              type="button"
              onClick={() => setQuantity(q => q + 1)}
            >+</button>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-secondary" type="button" onClick={onHide}>Cancelar</button>
        <button className="btn btn-primary" type="button" onClick={handleAdd} style={{ flex: 1 }}>
          Agregar al Carrito — L. {lineTotal.toFixed(2)}
        </button>
      </Modal.Footer>
    </Modal>
  );
};

export default AddToCartModal;
