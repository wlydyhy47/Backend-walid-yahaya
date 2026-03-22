const mongoose = require('mongoose');
const { users } = require('./user.fixture');
const { orders } = require('./order.fixture');

const reviewOneId = new mongoose.Types.ObjectId().toString();

const reviews = {
  fiveStar: {
    _id: reviewOneId,
    user: users.client._id,
    store: users.storeOwner.storeOwnerInfo.store,
    order: orders.completedOrder._id,
    rating: 5,
    comment: 'Excellent service and great food!',
    images: []
  },
  threeStar: {
    _id: new mongoose.Types.ObjectId().toString(),
    user: users.client._id,
    store: users.storeOwner.storeOwnerInfo.store,
    order: new mongoose.Types.ObjectId().toString(),
    rating: 3,
    comment: 'The food was okay, but delivery was a bit late.',
    images: []
  }
};

module.exports = {
  reviews
};
