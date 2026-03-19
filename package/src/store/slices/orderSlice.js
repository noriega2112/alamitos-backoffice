import { createSlice } from '@reduxjs/toolkit';

const STORAGE_KEY = 'active_order_id';

const orderSlice = createSlice({
  name: 'order',
  initialState: {
    activeOrderId: localStorage.getItem(STORAGE_KEY) || null,
    orderStatus: null,
  },
  reducers: {
    setActiveOrder: (state, action) => {
      // action.payload: { orderId, status }
      state.activeOrderId = action.payload.orderId;
      state.orderStatus = action.payload.status;
      localStorage.setItem(STORAGE_KEY, action.payload.orderId);
    },
    updateOrderStatus: (state, action) => {
      state.orderStatus = action.payload;
    },
    clearActiveOrder: (state) => {
      state.activeOrderId = null;
      state.orderStatus = null;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
});

export const { setActiveOrder, updateOrderStatus, clearActiveOrder } = orderSlice.actions;
export const selectActiveOrderId = (state) => state.order.activeOrderId;
export const selectOrderStatus = (state) => state.order.orderStatus;

export default orderSlice.reducer;
