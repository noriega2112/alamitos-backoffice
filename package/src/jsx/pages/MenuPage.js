import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useProducts, usePromotions } from '../../queries/useCatalog';
import { selectActiveOrderId } from '../../store/slices/orderSlice';
import { selectCartCount } from '../../store/slices/cartSlice';
import AddToCartModal from '../components/Menu/AddToCartModal';
import { supabase } from '../../supabaseClient';

const MenuPage = () => {
  const navigate = useNavigate();
  const activeOrderId = useSelector(selectActiveOrderId);
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: promotions = [], isLoading: promoLoading } = usePromotions();

  const [modalItem, setModalItem] = useState(null);
  const [modalType, setModalType] = useState('product');

  // On mount: if there's an active order, check if still active
  useEffect(() => {
    if (!activeOrderId) return;
    const checkOrder = async () => {
      const { data: order } = await supabase
        .from('orders')
        .select('id, status')
        .eq('id', activeOrderId)
        .single();
      if (order && !['delivered', 'rejected'].includes(order.status)) {
        navigate(`/status/${activeOrderId}`);
      }
    };
    checkOrder();
  }, [activeOrderId, navigate]);

  const openModal = (item, type) => {
    setModalItem(item);
    setModalType(type);
  };

  if (productsLoading || promoLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 200 }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Promotions Section */}
      {promotions.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-3">🔥 Promociones</h3>
          <div className="row g-3">
            {promotions.map(promo => (
              <div key={promo.id} className="col-12 col-sm-6 col-md-4">
                <div className="card h-100 shadow-sm">
                  {promo.image_url && (
                    <img
                      src={promo.image_url}
                      className="card-img-top"
                      alt={promo.name}
                      style={{ height: 180, objectFit: 'cover' }}
                    />
                  )}
                  <div className="card-body">
                    <span className="badge bg-danger mb-2">PROMO</span>
                    <h5 className="card-title">{promo.name}</h5>
                    <p className="card-text text-muted small">{promo.description}</p>
                    <p className="fw-bold text-primary fs-5 mb-0">L. {promo.price}</p>
                  </div>
                  <div className="card-footer bg-transparent border-0 pb-3">
                    <button
                      className="btn btn-primary w-100"
                      onClick={() => openModal(promo, 'promotion')}
                    >
                      Agregar +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Products Section */}
      <section>
        <h3 className="mb-3">🍽️ Menú</h3>
        <div className="row g-3">
          {products.map(product => (
            <div key={product.id} className="col-12 col-sm-6 col-md-4">
              <div className="card h-100 shadow-sm">
                {product.image_url && (
                  <img
                    src={product.image_url}
                    className="card-img-top"
                    alt={product.name}
                    style={{ height: 180, objectFit: 'cover' }}
                  />
                )}
                <div className="card-body">
                  <h5 className="card-title">{product.name}</h5>
                  <p className="card-text text-muted small">{product.description}</p>
                  <div className="mb-0">
                    {product.sale_price ? (
                      <>
                        <span className="text-muted text-decoration-line-through me-2 small">
                          L. {product.price}
                        </span>
                        <span className="fw-bold text-primary fs-5">L. {product.sale_price}</span>
                      </>
                    ) : (
                      <span className="fw-bold text-primary fs-5">L. {product.price}</span>
                    )}
                  </div>
                </div>
                <div className="card-footer bg-transparent border-0 pb-3">
                  <button
                    className="btn btn-primary w-100"
                    onClick={() => openModal(product, 'product')}
                  >
                    Agregar +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cart FAB */}
      <CartFAB />

      {/* Modal */}
      <AddToCartModal
        show={!!modalItem}
        onHide={() => setModalItem(null)}
        item={modalItem}
        type={modalType}
      />
    </div>
  );
};

const CartFAB = () => {
  const navigate = useNavigate();
  const cartCount = useSelector(selectCartCount);
  if (cartCount === 0) return null;
  return (
    <button
      className="btn btn-primary rounded-circle position-fixed d-flex align-items-center justify-content-center"
      style={{ bottom: 24, right: 24, width: 64, height: 64, fontSize: 18, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
      onClick={() => navigate('/cart')}
    >
      🛒
      <span
        className="badge bg-danger rounded-circle position-absolute"
        style={{ top: -4, right: -4, fontSize: 11, minWidth: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {cartCount}
      </span>
    </button>
  );
};

export default MenuPage;
