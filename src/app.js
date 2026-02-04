const express = require("express");
const cors = require("cors");
// done
const userRoutes = require("./routes/user.routes");

const authRoutes = require("./routes/auth.routes");

const restaurantRoutes = require("./routes/restaurant.routes");

const orderRoutes = require("./routes/order.routes");

const itemRoutes = require("./routes/item.routes");  


const addressRoutes = require("./routes/address.routes");

const restaurantAddressRoutes = require("./routes/restaurantAddress.routes");

// استيراد route التجميع الجديد
const aggregateRoutes = require("./routes/aggregate.routes");

const app = express();

app.use(cors({
  origin: 'http://localhost:3000', // اسمح فقط لهذا النطاق
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// middleware
app.use(express.json()); 

// test route
app.get("/", (req, res) => {
  res.json({ message: "API is working WALID YAHAYA✅" });
});


app.use("/api/users", userRoutes);

app.use("/api/restaurants", restaurantRoutes);

app.use("/api/items", itemRoutes);

app.use("/api/orders", orderRoutes);


app.use("/api/addresses", addressRoutes);


app.use("/api/restaurant-addresses", restaurantAddressRoutes);


app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes); 

app.use("/api/aggregate", aggregateRoutes);

// في server.js أو app.js



module.exports = app;
