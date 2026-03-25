import { createSlice, nanoid } from '@reduxjs/toolkit';

const loadCart = () => {
  try {
    const stored = localStorage.getItem('cart_items');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveCart = (items) => {
  localStorage.setItem('cart_items', JSON.stringify(items));
};

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: loadCart() },
  reducers: {
    addToCart: (state, action) => {
      // action.payload: { type, itemId, itemData, quantity, drinks: [{id,name,price,qty}], notes }
      const item = { ...action.payload, id: nanoid() };
      state.items.push(item);
      saveCart(state.items);
    },
    removeFromCart: (state, action) => {
      state.items = state.items.filter(i => i.id !== action.payload);
      saveCart(state.items);
    },
    updateQuantity: (state, action) => {
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) item.quantity = action.payload.quantity;
      saveCart(state.items);
    },
    updateItemDrinks: (state, action) => {
      // action.payload: { id, drinks: [{id,name,price,qty}] }
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) item.drinks = action.payload.drinks;
      saveCart(state.items);
    },
    clearCart: (state) => {
      state.items = [];
      saveCart(state.items);
    },
  },
});

export const { addToCart, removeFromCart, updateQuantity, updateItemDrinks, clearCart } = cartSlice.actions;

export const selectCartItems = (state) => state.cart.items;
export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, i) => sum + i.quantity, 0);
export const selectCartSubtotal = (state) =>
  state.cart.items.reduce((sum, item) => {
    const itemPrice = item.itemData.sale_price || item.itemData.price;
    const drinksTotal = (item.drinks || []).reduce((d, drink) => d + drink.price * (drink.qty || 1), 0);
    return sum + (itemPrice + drinksTotal) * item.quantity;
  }, 0);

export default cartSlice.reducer;
