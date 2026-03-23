import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper';
import 'swiper/css';
import { useProducts, usePromotions, useCategories } from '../../queries/useCatalog';
import { selectActiveOrderId, clearActiveOrder } from '../../store/slices/orderSlice';
import { selectCartCount } from '../../store/slices/cartSlice';
import AddToCartModal from '../components/Menu/AddToCartModal';
import { supabase } from '../../supabaseClient';

const MenuPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const activeOrderId = useSelector(selectActiveOrderId);
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: promotions = [], isLoading: promoLoading } = usePromotions();
  const { data: categories = [] } = useCategories();

  const [modalItem, setModalItem] = useState(null);
  const [modalType, setModalType] = useState('product');
  const [activeCategory, setActiveCategory] = useState(null);

  const sectionRefs = useRef({});
  const swiperRef = useRef(null);
  const navPlaceholderRef = useRef(null);
  const [navFixed, setNavFixed] = useState(false);
  const [navPos, setNavPos] = useState({ left: 0, right: 0 });
  const HEADER_H = 88; // 5.5rem × 16px

  // On mount: if there's an active order, check if still active
  useEffect(() => {
    if (!activeOrderId) return;
    const checkOrder = async () => {
      const { data: order } = await supabase.from('orders').select('id, status').eq('id', activeOrderId).single();
      if (order && order.status !== 'rejected') {
        navigate(`/status/${activeOrderId}`);
      } else {
        dispatch(clearActiveOrder());
      }
    };
    checkOrder();
  }, [activeOrderId, navigate, dispatch]);

  // Group products by category (preserving category order)
  const groupedCategories = useMemo(() => {
    return categories
      .map((cat) => ({
        ...cat,
        products: products.filter((p) => p.category_id === cat.id),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [categories, products]);

  // Initialize active category once groups are ready
  useEffect(() => {
    if (groupedCategories.length > 0 && activeCategory === null) {
      setActiveCategory(groupedCategories[0].id);
    }
  }, [groupedCategories, activeCategory]);

  // Scrollspy: observe each category section
  useEffect(() => {
    if (groupedCategories.length === 0) return;

    const visibilityMap = {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibilityMap[entry.target.dataset.catId] = entry.intersectionRatio;
        });
        const best = Object.entries(visibilityMap).sort((a, b) => b[1] - a[1])[0];
        if (best && Number(best[1]) > 0) {
          setActiveCategory(Number(best[0]));
        }
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );

    groupedCategories.forEach(({ id }) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [groupedCategories]);

  // Slide swiper to active category
  useEffect(() => {
    if (!swiperRef.current || activeCategory === null) return;
    const idx = groupedCategories.findIndex((c) => c.id === activeCategory);
    if (idx >= 0) swiperRef.current.slideTo(idx);
  }, [activeCategory, groupedCategories]);

  // Fixed-nav scroll listener (position:sticky broken by overflow:hidden on #main-wrapper)
  useEffect(() => {
    if (groupedCategories.length === 0) return;
    const handleScroll = () => {
      const el = navPlaceholderRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top <= HEADER_H) {
        const container = el.closest('.container');
        if (container) {
          const cr = container.getBoundingClientRect();
          setNavPos({ left: cr.left, right: window.innerWidth - cr.right });
        }
        setNavFixed(true);
      } else {
        setNavFixed(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [groupedCategories]);

  const scrollToCategory = (catId) => {
    sectionRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
      {/* Promotions Carousel */}
      {promotions.length > 0 && (
        <section>
          <h3 className="mb-3">🔥 Promociones</h3>
          <div className="position-relative">
            <div className="swiper-pagination-banner"></div>
            <Swiper
              className="mySwiper-1"
              slidesPerView={1}
              spaceBetween={30}
              pagination={{ el: '.swiper-pagination-banner', clickable: true }}
              autoplay={{ delay: 3000 }}
              modules={[Autoplay, Pagination]}
            >
              {promotions.map((promo) => (
                <SwiperSlide key={promo.id}>
                  <div
                    className="banner-bx position-relative"
                    style={{ cursor: 'pointer' }}
                    onClick={() => openModal(promo, 'promotion')}
                  >
                    {promo.image_url ? (
                      <img
                        src={promo.image_url}
                        alt={promo.name}
                        style={{
                          width: '100%',
                          height: 220,
                          objectFit: 'cover',
                          borderRadius: 'var(--bs-border-radius)',
                        }}
                      />
                    ) : (
                      <div
                        className="d-flex align-items-center justify-content-center bg-secondary text-white"
                        style={{ height: 220 }}
                      >
                        {promo.name}
                      </div>
                    )}
                    <div
                      className="position-absolute bottom-0 start-0 end-0 p-3"
                      style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}
                    >
                      <span className="badge bg-danger me-2">PROMO</span>
                      <span className="text-white fw-bold">{promo.name}</span>
                      <span className="text-white ms-2">— L. {promo.sale_price || promo.price}</span>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </section>
      )}

      {/* Categories Nav (fixed via scroll listener — position:sticky broken by overflow:hidden on #main-wrapper) */}
      {groupedCategories.length > 0 && (
        <div ref={navPlaceholderRef} style={{ marginBottom: '1rem', height: navFixed ? 72 : 'auto' }}>
          <div
            className="bg-white py-2 px-3"
            style={
              navFixed
                ? {
                    position: 'fixed',
                    top: HEADER_H,
                    left: navPos.left,
                    right: navPos.right,
                    zIndex: 10,
                    // boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }
                : {
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }
            }
          >
            <Swiper
              className="mySwiper-2"
              slidesPerView={5}
              spaceBetween={20}
              modules={[]}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
              breakpoints={{
                360: { slidesPerView: 2, spaceBetween: 20 },
                600: { slidesPerView: 3, spaceBetween: 20 },
                768: { slidesPerView: 4, spaceBetween: 20 },
                1200: { slidesPerView: 3, spaceBetween: 20 },
                1920: { slidesPerView: 5, spaceBetween: 20 },
              }}
            >
              {groupedCategories.map((cat) => (
                <SwiperSlide key={cat.id}>
                  <div
                    className="cate-bx text-center"
                    style={{ cursor: 'pointer' }}
                    onClick={() => scrollToCategory(cat.id)}
                  >
                    <div
                      className="card"
                      style={
                        activeCategory === cat.id
                          ? { borderColor: 'var(--primary)', background: 'var(--primary)', color: '#fff' }
                          : {}
                      }
                    >
                      <div className="card-body py-2">
                        <h6 className="mb-0 font-w500" style={activeCategory === cat.id ? { color: '#fff' } : {}}>
                          {cat.name}
                        </h6>
                      </div>
                    </div>
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </div>
      )}

      {/* Products grouped by category */}
      {groupedCategories.map((cat) => (
        <section
          key={cat.id}
          ref={(el) => {
            sectionRefs.current[cat.id] = el;
          }}
          data-cat-id={cat.id}
          className="mb-5"
        >
          <h4 className="mb-3">{cat.name}</h4>
          <div className="row g-3">
            {cat.products.map((product) => (
              <div key={product.id} className="col-6 col-md-4">
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
                          <span className="text-muted text-decoration-line-through me-2 small">L. {product.price}</span>
                          <span className="fw-bold text-primary fs-5">L. {product.sale_price}</span>
                        </>
                      ) : (
                        <span className="fw-bold text-primary fs-5">L. {product.price}</span>
                      )}
                    </div>
                  </div>
                  <div className="card-footer bg-transparent border-0 pb-3">
                    <button className="btn btn-primary w-100" onClick={() => openModal(product, 'product')}>
                      Agregar +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Cart FAB */}
      <CartFAB />

      {/* Modal */}
      <AddToCartModal show={!!modalItem} onHide={() => setModalItem(null)} item={modalItem} type={modalType} />
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
      style={{
        bottom: 24,
        right: 24,
        width: 64,
        height: 64,
        fontSize: 18,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
      onClick={() => navigate('/cart')}
    >
      🛒
      <span
        className="badge bg-danger rounded-circle position-absolute"
        style={{
          top: -4,
          right: -4,
          fontSize: 11,
          minWidth: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {cartCount}
      </span>
    </button>
  );
};

export default MenuPage;
