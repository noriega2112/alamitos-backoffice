import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PiShoppingCartBold } from 'react-icons/pi';

const EmptyCart = () => {
  const navigate = useNavigate();

  return (
    <div className="py-4">
      <div className="card dlab-bg">
        <div className="card-body text-center py-5">
          <PiShoppingCartBold size={48} className="text-primary" />
          <h4>Tu carrito está vacío</h4>
          <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>
            Ver Menú
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmptyCart;
