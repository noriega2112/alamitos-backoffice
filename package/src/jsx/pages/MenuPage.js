import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation } from 'swiper';
import 'swiper/css';
import 'swiper/css/navigation';
import { useProducts, usePromotions, useCategories } from '../../queries/useCatalog';
import { selectActiveOrderId, clearActiveOrder } from '../../store/slices/orderSlice';
import { selectCartCount } from '../../store/slices/cartSlice';
import AddToCartModal from '../components/Menu/AddToCartModal';
import { supabase } from '../../supabaseClient';
import { PiFireBold, PiShoppingCartBold } from 'react-icons/pi';

const CHIP_COLORS = [
  { color: '#0066FF', contrast: '#fff' },
  { color: '#FF8C00', contrast: '#fff' },
  { color: '#00B4D8', contrast: '#fff' },
  { color: '#FF1744', contrast: '#fff' },
  { color: '#E91E90', contrast: '#fff' },
];

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
  const [navPos, setNavPos] = useState({ left: 0, right: 0, top: 0 });

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

  // Stable color mapping per category
  const categoryColors = useMemo(() => {
    const map = {};
    groupedCategories.forEach((cat, i) => {
      map[cat.id] = CHIP_COLORS[i % CHIP_COLORS.length];
    });
    return map;
  }, [groupedCategories]);

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
      const headerEl = document.querySelector('.header');
      const headerH = headerEl ? headerEl.getBoundingClientRect().height : 64;
      const top = el.getBoundingClientRect().top;
      if (top <= headerH) {
        const container = el.closest('.container');
        if (container) {
          const cr = container.getBoundingClientRect();
          setNavPos({ left: cr.left, right: window.innerWidth - cr.right, top: headerH });
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
    const section = sectionRefs.current[catId];
    if (!section) return;
    const headerEl = document.querySelector('.header');
    const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0;
    const navEl = document.querySelector('.category-nav-wrapper');
    const navH = navEl ? navEl.getBoundingClientRect().height : 0;
    const y = section.getBoundingClientRect().top + window.scrollY - headerH - navH - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
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
          <h4 className="category-tab"><PiFireBold size={28} className="me-1 text-danger" /> Promociones <PiFireBold size={28} className="ms-1 text-danger" /></h4>
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
        <div ref={navPlaceholderRef} style={{ marginBottom: '1rem', height: navFixed ? 56 : 'auto' }}>
          <div
            className="category-nav-wrapper"
            style={
              navFixed
                ? {
                    position: 'fixed',
                    top: navPos.top,
                    left: navPos.left,
                    right: navPos.right,
                    zIndex: 10,
                  }
                : {}
            }
          >
            <button className="category-nav-arrow category-nav-arrow-left" aria-label="Anterior">
              <i className="fa-solid fa-chevron-left" />
            </button>
            <Swiper
              className="mySwiper-2 category-swiper"
              slidesPerView="auto"
              spaceBetween={8}
              modules={[Navigation]}
              navigation={{
                prevEl: '.category-nav-arrow-left',
                nextEl: '.category-nav-arrow-right',
              }}
              onSwiper={(swiper) => {
                swiperRef.current = swiper;
              }}
            >
              {groupedCategories.map((cat) => {
                const chipColor = categoryColors[cat.id];
                return (
                  <SwiperSlide key={cat.id} style={{ width: 'auto' }}>
                    <div
                      className={`category-chip ${activeCategory === cat.id ? 'active' : ''}`}
                      style={{ '--chip-color': chipColor.color, '--chip-contrast': chipColor.contrast }}
                      onClick={() => scrollToCategory(cat.id)}
                    >
                      {cat.name}
                    </div>
                  </SwiperSlide>
                );
              })}
            </Swiper>
            <button className="category-nav-arrow category-nav-arrow-right" aria-label="Siguiente">
              <i className="fa-solid fa-chevron-right" />
            </button>
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
          <h4 className="category-tab">{cat.name}</h4>
          <div className="row g-3 category-row">
            {cat.products.map((product, idx) => (
              <div key={product.id} className="col-6 col-md-4">
                <div className={`card h-100 category-card${idx === 0 ? ' category-card-first' : ''}`}>
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
      className="btn rounded-circle position-fixed d-flex align-items-center justify-content-center"
      style={{
        bottom: 24,
        right: 24,
        width: 64,
        height: 64,
        fontSize: 18,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        backgroundColor: '#FF8C00',
        borderColor: '#FF8C00',
        color: '#fff',
      }}
      onClick={() => navigate('/cart')}
    >
      <PiShoppingCartBold size={24} />
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
