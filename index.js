const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

    const db = client.db("shareMealDB");
    const foodCollection = db.collection("foods");
    const foodRequestCollection = db.collection("foodRequests");

    // Home check
    app.get("/", (req, res) => res.send("Server is running"));

    // Protected: Get All Foods
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

    // Protected: Get Available Foods (with search & sort)
    app.get("/foods-available", verifyToken, async (req, res) => {
      const search = req.query.search || "";
      const sortOrder = req.query.sort === "desc" ? -1 : 1;

      const query = {
        status: "available",
        name: { $regex: search, $options: "i" },
      };

      try {
        const foods = await foodCollection
          .find(query)
          .sort({ expireAt: sortOrder })
          .toArray();

        res.send(foods);
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch available foods",
          error: err.message,
        });
      }
    });

    // Protected: Add a New Food
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

    // Protected: Get Single Food Details
    app.get("/food/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const food = await foodCollection.findOne({ _id: new ObjectId(id) });
        if (!food) return res.status(404).send({ message: "Food not found" });

        res.send(food);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Error fetching food", error: error.message });
      }
    });

    //  Protected: Request Food
    app.post("/request-food", verifyToken, async (req, res) => {
      const request = req.body;
      if (
        !request.foodId ||
        !request.donorName ||
        !request.userEmail ||
        !request.requestDate
      ) {
        return res
          .status(400)
          .send({ message: "Missing required request data" });
      }

      try {
        const insertResult = await foodRequestCollection.insertOne(request);

        const updateResult = await foodCollection.updateOne(
          { _id: new ObjectId(request.foodId) },
          { $set: { status: "requested" } }
        );

        res.send({
          insertedId: insertResult.insertedId,
          updated: updateResult.modifiedCount,
        });
      } catch (err) {
        res.status(500).send({ message: "Request failed", error: err.message });
      }
    });

    //  Protected: Get My Food Requests
    app.get("/my-requests", verifyToken, async (req, res) => {
      const email = req.query.email;

      if (!email || email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      try {
        const myRequests = await foodRequestCollection
          .find({ userEmail: email })
          .sort({ requestDate: -1 })
          .toArray();

        res.send(myRequests);
      } catch (err) {
        res.status(500).send({
          message: "Failed to fetch your requests",
          error: err.message,
        });
      }
    });

    // Protected: Get Foods by Logged-in User
    app.get("/my-foods", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email || email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      try {
        const myFoods = await foodCollection
          .find({ donorEmail: email })
          .toArray();
        res.send(myFoods);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch your foods", error: err.message });
      }
    });

    // Protected: Delete a food
    app.delete("/foods/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      try {
        const food = await foodCollection.findOne({ _id: new ObjectId(id) });

        // Only allow deletion if logged-in user is the owner
        if (!food || food.donorEmail !== req.user.email) {
          return res
            .status(403)
            .send({ message: "Unauthorized to delete this food" });
        }

        const result = await foodCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ deletedCount: result.deletedCount });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Error deleting food", error: error.message });
      }
    });

    // Protected: Update Food by ID
    app.put("/food/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        const result = await foodCollection.updateOne(
          { _id: new ObjectId(id), donorEmail: req.user.email },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ message: "Food not found or unauthorized" });
        }

        res.send({ updatedCount: result.modifiedCount });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Update failed", error: error.message });
      }
    });

    // Start the server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run();
