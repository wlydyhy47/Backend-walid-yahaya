const mongoose = require('mongoose');
const { users } = require('./user.fixture');

const addressOneId = new mongoose.Types.ObjectId().toString();
const addressTwoId = new mongoose.Types.ObjectId().toString();

const addresses = {
  home: {
    _id: addressOneId,
    user: users.client._id,
    type: 'home',
    title: 'Home',
    street: '123 Fake Street',
    building: 'Aperture Science',
    floor: '2',
    apartment: '204',
    location: {
      type: 'Point',
      coordinates: [2.1098, 13.5126]
    },
    isDefault: true
  },
  work: {
    _id: addressTwoId,
    user: users.client._id,
    type: 'work',
    title: 'Work',
    street: '456 Business Ave',
    location: {
      type: 'Point',
      coordinates: [2.1150, 13.5200]
    },
    isDefault: false
  }
};

module.exports = {
  addresses
};
