import { applyMiddleware, combineReducers, compose,createStore,} from 'redux';
import PostsReducer from './reducers/PostsReducer';
import thunk from 'redux-thunk';
import { AuthReducer } from './reducers/AuthReducer';
import todoReducers from './reducers/Reducers';
import cartReducer from './slices/cartSlice';
import orderReducer from './slices/orderSlice';
//import { reducer as reduxFormReducer } from 'redux-form';
const middleware = applyMiddleware(thunk);

const composeEnhancers =
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

const reducers = combineReducers({
    posts: PostsReducer,
    auth: AuthReducer,
		todoReducers,
    cart: cartReducer,
    order: orderReducer,
	//form: reduxFormReducer,

});

//const store = createStore(rootReducers);

export const store = createStore(reducers,  composeEnhancers(middleware));
