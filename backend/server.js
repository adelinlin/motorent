const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const sgMail = require("@sendgrid/mail");
const saltRounds = 10;
const app = express();

const stripe = require("stripe")(
  "sk_test_51OX6mWDgWC8qPZRiwr7LSFiDsO4HkhqLDE2wTLKymlOtGCp3dtR9ZnNflK0UOppHiCuKUHgORHUjXv5V4VjVk5ud00JsUuk1Nt"
);

require("dotenv").config();

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

mongoose.connect("mongodb://localhost:27017/users", { useNewUrlParser: true });

sgMail.setApiKey(process.env.API_KEY);

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  username: String,
  password: String,
  isAdmin: Boolean,
});

const bikeSchema = new mongoose.Schema({
  name: String,
  year: Number,
  category: String,
  image: String,
  seats: Number,
  fuel: String,
  quantity: Number,
  price: Number,
});

const reservationSchema = new mongoose.Schema({
  userID: { type: String, ref: "User" },
  bikeID: { type: mongoose.Schema.Types.ObjectId, ref: "Bike" },
  bikeName: String,
  startDate: Date,
  endDate: Date,
  price: Number,
  status: String,
  created: Date,
});

const codeSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
  },
});

const reviewSchema = new mongoose.Schema({
  username: String,
  message: String,
  rating: Number,
  approved: Boolean,
});

const paymentSchema = new mongoose.Schema({
  username: String,
  date: Date,
  amount: Number,
});

const User = mongoose.model("User", userSchema);
const Bike = mongoose.model("Bike", bikeSchema);
const Reservation = mongoose.model("Reservation", reservationSchema);
const Code = mongoose.model("Code", codeSchema);
const Review = mongoose.model("Review", reviewSchema);
const Payment = mongoose.model("Payment", paymentSchema);

app.post("/payment", cors(), async (req, res) => {
  let { amount, id, reservationId, username } = req.body;
  try {
    const payment = await stripe.paymentIntents.create({
      amount,
      currency: "USD",
      description: "Bike rental",
      payment_method: id,
      confirm: true,
    });
    console.log("Payment", payment);
    await Reservation.findByIdAndUpdate(reservationId, {
      status: "Paid",
    });

    const date = new Date();

    const amountNumber = parseInt(amount);
    const entity = new Payment({
      username,
      date,
      amount: amountNumber / 100,
    });
    await entity.save();

    const message = {
      to: userID,
      from: "adelinpintea@gmail.com",
      subject: "Successful payment",
      text: `Congrats for paying: $${amountNumber / 100}`,
    };
    sgMail.send(message);

    res.status(200).json({
      message: "Payment successful",
      success: true,
    });
  } catch (error) {
    console.log("Error", error);
    res.json({
      message: "Payment failed",
      success: false,
    });
  }
});

app.get("/admin/payments", async (req, res) => {
  try {
    const payments = await Payment.find();
    res.status(200).json(payments);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching reviews" });
  }
});

app.post("/api/register", async (req, res) => {
  const { firstName, lastName, username, password, repPassword } = req.body;

  if (!firstName || !lastName || !username || !password) {
    return res.status(400).send({ message: "All fields are required" });
  }

  if (password !== repPassword) {
    return res.status(400).send({ message: "Passwords do not match" });
  }

  // Check if the username already exists in the database
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(409).send({ message: "Username already exists" });
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create a new user object
  const newUser = new User({
    firstName,
    lastName,
    username,
    password: hashedPassword,
    isAdmin: false,
  });

  try {
    await newUser.save();
    res.status(201).send({ message: "User created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find the user in the database
    const user = await User.findOne({ username });

    // If the user doesn't exist, send an error message
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const passwordMatches = true;

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign({ username }, "my-secure-string", {
      expiresIn: "1h",
    });

    // If the password matches, send a success message
    res.status(200).json({
      message: "Login successsssful",
      token: token,
      _id: user._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/admin/bikes", async (req, res) => {
  const { name, year, category, image, seats, fuel, quantity, price } =
    req.body;

  console.log(name);
  if (
    !name ||
    !year ||
    !category ||
    !image ||
    !seats ||
    !fuel ||
    !quantity ||
    !price ||
    isNaN(parseInt(year)) ||
    parseInt(year) < 1900 ||
    parseInt(year) > 2100 ||
    isNaN(parseInt(quantity)) ||
    parseInt(quantity) <= 0 ||
    isNaN(parseFloat(price)) ||
    parseFloat(price) <= 0
  ) {
    res.status(400).json({ message: "Invalid input fields" });
    return;
  }
  try {
    const bike = await Bike.findOne({ name });
    if (bike) {
      const numberedBikeQuantity = parseInt(bike.quantity);
      const numberedQuantity = parseInt(quantity);
      bike.quantity = numberedBikeQuantity + numberedQuantity;
      await bike.save();
    } else {
      const newBike = new Bike({
        name,
        year,
        category,
        image,
        seats,
        fuel,
        quantity,
        price,
      });
      await newBike.save();
    }
    res.status(200).send({ message: "Bike added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/admin/check", async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username: username });
    if (user.isAdmin === true) {
      res.status(200).json({ message: "A fost gasit" });
    } else res.status(500).json({ message: "Nu a fost gasit" });
  } catch (err) {
    console.error(err);
    res.status(500);
  }
});

app.get("/admin/review", async (req, res) => {
  try {
    const reviews = await Review.find();
    res.json(reviews);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching reviews" });
  }
});

app.put("/admin/review", async (req, res) => {
  try {
    const { id } = req.body;
    await Review.findByIdAndUpdate(id, {
      approved: 1,
    });
    res.status(200).json({ message: "Updated OK" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching reviews" });
  }
});
app.delete("/admin/review", async (req, res) => {
  try {
    const { id } = req.body;
    await Review.deleteOne({ _id: id });
    res.status(200).json({ message: "Success" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/admin/review", async (req, res) => {
  try {
    const { id } = req.body;
    await Review.findByIdAndUpdate(id, {
      approved: 1,
    });
    res.status(200).json({ message: "Updated OK" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error fetching reviews" });
  }
});

app.post("/admin/review", async (req, res) => {
  const { username, message, rating } = req.body;
  console.log(req.body);
  try {
    const review = new Review({
      username,
      message,
      rating,
      approved: 0,
    });
    await review.save();
    res.status(200).json({ message: "Review added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/admin/bikes", async (req, res) => {
  const { name, year, image, seats, fuel, quantity, price } = req.body;
  console.log(name);
  if (
    !quantity ||
    !price ||
    isNaN(parseInt(quantity)) ||
    parseInt(quantity) <= 0 ||
    isNaN(parseFloat(price)) ||
    parseFloat(price) <= 0
  ) {
    res.status(400).json({ message: "Invalid input fields" });
    return;
  }
  try {
    const bike = await Bike.findOne({ name });
    if (bike) {
      bike.name = name;
      bike.quantity = quantity;
      bike.price = price;
      bike.image = image;
      // console.log(bike);
      await bike.save();
    }
    res.status(200).send({ message: "Bike added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/admin/bikes", async (req, res) => {
  const { id } = req.body;
  try {
    await Bike.deleteOne({ _id: id });
    res.status(200).send({ message: "Bike deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/search", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    const stDate = new Date(startDate);
    const enDate = new Date(endDate);

    const bikes = await Bike.find();
    const bikeReservations = await Reservation.find();

    bikeReservations.map((reservation) => {
      if (reservation.status === "Confirmed") {
        if (
          (stDate < reservation.startDate && enDate > reservation.startDate) ||
          (stDate < reservation.endDate && enDate > reservation.startDate)
        ) {
          bikes.forEach((bike) => {
            if (bike._id.toString() == reservation.bikeID.toString()) {
              bike.quantity -= 1;
            }
          });
        }
      }
    });

    const filteredBikes = bikes.filter((bike) => bike.quantity > 0);
    res.status(200).json({ filteredBikes, debug: bikeReservations.length });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

function generateRandomNumber() {
  return Math.floor(Math.random() * 9000000) + 1000000;
}

app.post("/api/book", async (req, res) => {
  const { userID, bikeID, bikeName, startDate, endDate, price } = req.body;

  console.log(req.body);

  let d1 = new Date(endDate);
  let d2 = new Date(startDate);
  let timeDiff = Math.abs(d1.getTime() - d2.getTime());
  let diffDays = Math.abs(timeDiff / (1000 * 3600 * 24));

  const reservation = new Reservation({
    userID,
    bikeID,
    bikeName,
    startDate,
    endDate,
    status: "Pending",
    price: price * diffDays + price,
    created: null,
  });

  try {
    await reservation.save();
    const random = generateRandomNumber();
    if (userID) {
      const message = {
        to: userID,
        from: "adelinpintea@gmail.com",
        subject: "Please confirm your reservation",
        text: `Your reservation code is: ${random}`,
      };
      sgMail.send(message);
    }

    const code = new Code({ code: random });
    await code.save();
    res.status(201).send({ message: "Reservation created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/user/reservations", async (req, res) => {
  try {
    const { username } = req.body;
    // console.log(user);
    const currentUser = await User.find({ username: username });
    const reservationList = await Reservation.find({ userID: username });

    res.json({ reservationList, username: username });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/user/check", async (req, res) => {
  const { user } = req.body;
  try {
    const reservations = await Reservation.find({ userID: user });
    res.status(200).json(reservations);
  } catch (err) {
    res.status(500).json({ message: "Error fetching reservations" });
  }
});

app.put("/user/verify", async (req, res) => {
  const { code, id, userID } = req.body;
  try {
    const checkedCode = await Code.find({ code });
    const now = new Date();
    if (checkedCode.length) {
      await Reservation.findByIdAndUpdate(id, {
        status: "Confirmed",
        created: now,
      });
      const message = {
        to: userID,
        from: "adelinpintea@gmail.com",
        subject: "Confirmation",
        text: `Your reservation has been successfully confirmed. You have 1h to pay it before it cancels`,
      };

      sgMail.send(message);
      res.status(200).json({ message: "Updated Successfully" });
    } else {
      res.status(500).json({ message: "Failed to verify" });
    }
  } catch (err) {
    res.status(500).json({ message: "Failed to verify" });
  }
});

app.get("/api/allreservations", async (req, res) => {
  try {
    const reservations = await Reservation.find();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ message: "Error fetching reservations" });
  }
});

app.get("/api/allusers", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get("/api/allbikes", async (req, res) => {
  try {
    const bikes = await Bike.find();
    console.log(bikes);
    res.json(bikes);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bikes" });
  }
});

app.get("/", (req, res) => {
  res.send("Buna seara dragilor");
});

app.delete("/api/users", async (req, res) => {
  try {
    const { _id, username } = req.body;
    const reservations = await Reservation.find({ userID: username });

    const inputDate = new Date();
    // Extract the year, month, and day from the input date
    const year = inputDate.getFullYear();
    const month = String(inputDate.getMonth() + 1).padStart(2, "0"); // Months are zero-based, so add 1
    const day = String(inputDate.getDate()).padStart(2, "0");

    // Create a new date string in the desired format
    const transformedDate = `${year}-${month}-${day}T00:00:00.000Z`;

    const finalDate = new Date(transformedDate);
    console.log(finalDate.getTime());

    const filteredReservation = reservations
      .filter((reservation) => reservation.status === "Paid")
      .filter(
        (reservation) =>
          finalDate.getTime() < new Date(reservation.endDate).getTime()
      );
    console.log(filteredReservation);
    if (filteredReservation.length > 0)
      return res.status(400).json({
        message: "Exista rezervari tataie",
      });
    await User.deleteOne({ _id: _id });
    res.status(200).json({ message: "Success" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/user/reservation", async (req, res) => {
  try {
    const { _id } = req.body;
    await Reservation.deleteOne({ _id: _id });
    res.status(200).json({ message: "Success" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// This is the port our app will run on.
app.listen(5002);
