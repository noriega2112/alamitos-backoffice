import React, { Fragment, useEffect, useState } from "react";
import Products from "./Products";
import PageTitle from "../../../../layouts/PageTitle";
import { supabase } from "../../../../../supabaseClient";

const ProductGrid = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase.from("products").select("*");
        if (error) {
          throw error;
        }
        setProducts(data);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) {
    return <div>Loading products...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <Fragment>
      <PageTitle activeMenu="Blank" motherMenu="Layout" />
      <div className="row">
        {products.map((product) => (
          <Products key={product.id} product={product} />
        ))}
      </div>
    </Fragment>
  );
};

export default ProductGrid;
