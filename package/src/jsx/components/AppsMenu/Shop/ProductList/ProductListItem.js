import React from "react";
import { Link } from "react-router-dom";

const ProductListItem = ({ product: { name, image_url, price, description } }) => {
  return (
    <div className="col-lg-12 col-xl-6">
      <div className="card">
        <div className="card-body">
          <div className="row m-b-30">
            <div className="col-md-5 col-xxl-12">
              <div className="new-arrival-product mb-4 mb-xxl-4 mb-md-0">
                <div className="new-arrivals-img-contnent">
                  <img className="img-fluid" src={image_url} alt="" />
                </div>
              </div>
            </div>
            <div className="col-md-7 col-xxl-12">
              <div className="new-arrival-content position-relative">
                <h4>
                  <Link to="/ecom-product-detail">{name}</Link>
                </h4>
                {/* Removed static rating stars */}
                <p className="price">${price}</p>
                <p className="text-content">
                  {description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductListItem;
