const express = require("express");
const cors = require("cors");
const app = express();
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
dotenv.config();

// Database
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.sguoua9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const foodCollection = client.db("shareMealDB").collection("foods");

    // JWT Verification Middleware
    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

      const token = authHeader.split(" ")[1];
      if (!admin.apps.length) {
        admin.initializeApp();
      }

      admin
        .auth()
        .verifyIdToken(token)
        .then((decoded) => {
          req.user = decoded;
          next();
        })
        .catch(() => res.status(401).send({ message: "Invalid token" }));
    };

    // Get All Foods
    app.get("/foods", async (req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    });

    // Add Food Route
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

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
