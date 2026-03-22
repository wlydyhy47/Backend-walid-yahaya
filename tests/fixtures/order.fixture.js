const mongoose = require('mongoose');
const { users } = require('./user.fixture');
const { addresses } = require('./address.fixture');

const orderOneId = new mongoose.Types.ObjectId().toString();

const orders = {
  pendingOrder: {
    _id: orderOneId,
    user: users.client._id,
    store: users.storeOwner.storeOwnerInfo.store,
    deliveryAddress: addresses.home._id,
    items: [
      {
        product: new mongoose.Types.ObjectId().toString(),
        name: 'Burger',
        quantity: 2,
        price: 5.00,
        subtotal: 10.00
      }
    ],
    subtotal: 10.00,
    deliveryFee: 2.00,
    totalPrice: 12.00,
    status: 'pending',
    paymentMethod: 'cash',
    paymentStatus: 'pending'
  },
  completedOrder: {
    _id: new mongoose.Types.ObjectId().toString(),
    user: users.client._id,
    store: users.storeOwner.storeOwnerInfo.store,
    driver: users.driver._id,
    deliveryAddress: addresses.work._id,
    items: [
      {
        product: new mongoose.Types.ObjectId().toString(),
        name: 'Pizza',
        quantity: 1,
        price: 15.00,
        subtotal: 15.00
      }
    ],
    subtotal: 15.00,
    deliveryFee: 3.00,
    totalPrice: 18.00,
    status: 'delivered',
    paymentMethod: 'card',
    paymentStatus: 'paid'
  }
};

module.exports = {
  orders
};
