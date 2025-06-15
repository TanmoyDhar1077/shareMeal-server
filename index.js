const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Firebase Admin Initialization
const serviceAccount = require("./firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.sguoua9.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Middleware to verify Firebase JWT
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res
      .status(401)
      .send({ message: "Invalid token", error: error.message });
  }
};

async function run() {
  try {
    await client.connect();
    const foodCollection = client.db("shareMealDB").collection("foods");

    // Protected GET Route to fetch all foods (verifyToken) middleware add
    // Unprotected GET Route to fetch all foods
    app.get("/foods", verifyToken, async (req, res) => {
      try {
        const result = await foodCollection.find().toArray();
        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch foods", error: err.message });
      }
    });

    // Unprotected GET Route to fetch available foods
    app.get("/foods-available", verifyToken, async (req, res) => {
      const search = req.query.search || "";
      const sortOrder = req.query.sort === "desc" ? -1 : 1;

      const query = {
        status: "available",
        name: { $regex: search, $options: "i" },
      };

      const foods = await foodCollection
        .find(query)
        .sort({ expireAt: sortOrder })
        .toArray();

      res.send(foods);
    });

    // Protected POST Route
    app.post("/foods", verifyToken, async (req, res) => {
      const foodData = req.body;
      if (!foodData.name || !foodData.img || !foodData.location) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      try {
        const result = await foodCollection.insertOne(foodData);
        res.send({ insertedId: result.insertedId });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Database error", error: error.message });
      }
    });

    // Initial check
    app.get("/", (req, res) => res.send("Server is running"));

    // Start server
    app.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
run();
