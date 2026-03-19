import { createSlice } from '@reduxjs/toolkit';

let nextId = 1;

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: {
    addToCart: (state, action) => {
      // action.payload: { type: 'product'|'promotion', itemId, itemData, quantity, drinks, notes }
      const item = { ...action.payload, id: String(nextId++) };
      state.items.push(item);
    },
    removeFromCart: (state, action) => {
      state.items = state.items.filter(i => i.id !== action.payload);
    },
    updateQuantity: (state, action) => {
      // action.payload: { id, quantity }
      const item = state.items.find(i => i.id === action.payload.id);
      if (item) item.quantity = action.payload.quantity;
    },
    clearCart: (state) => {
      state.items = [];
    },
  },
});

export const { addToCart, removeFromCart, updateQuantity, clearCart } = cartSlice.actions;

export const selectCartItems = (state) => state.cart.items;
export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, i) => sum + i.quantity, 0);
export const selectCartSubtotal = (state) =>
  state.cart.items.reduce((sum, item) => {
    const itemPrice = item.itemData.sale_price || item.itemData.price;
    const drinksTotal = (item.drinks || []).reduce((d, drink) => d + drink.price, 0);
    return sum + (itemPrice + drinksTotal) * item.quantity;
  }, 0);

export default cartSlice.reducer;
