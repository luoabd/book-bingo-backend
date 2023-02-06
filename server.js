import fetch from "node-fetch";
import express from "express";
import * as dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import cors from "cors";
import { config } from "./Constants.js";

dotenv.config();

const app = express();
const URL = config.url;
const port = config.port;

let corsOptions = {
  origin: [URL],
};
app.use(cors(corsOptions));
app.use(express.json());

app.get("/api", function (req, res) {
  async function fetchBooksJSON() {
    const api_key = process.env.API_KEY;
    const fields =
      "items/volumeInfo(title,authors,industryIdentifiers,imageLinks)";
    const max = "5";
    const inputValue = req.query.search_q;

    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${inputValue}&maxResults=${max}&fields=${fields}`
    );
    const books = await response.json();
    return books.items;
  }
  fetchBooksJSON().then((books) => {
    res.send(books);
  });
});

app.post("/canvas", function (req, res) {
  const canvas = createCanvas(2000, 2300);
  const ctx = canvas.getContext("2d");

  loadImage("./bingo_board.png").then((image) => {
    ctx.drawImage(image, 0, 0);
  });

  const drawBoard = async () => {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        let idx = 5 * i + j;
        let prompt = req.body[idx];
        if (prompt.isFilled) {
          // Async shenanigans
          const draw = await loadImage(prompt.imgLink).then((image) => {
            ctx.drawImage(image, 130 + 370 * j, 332 + 400 * i, 254, 316);
          });
        }
      }
    }
  };
  const exportBoard = async () => {
    const finalBoard = await drawBoard();
    var img = canvas.toDataURL();

    // strip off the data: url prefix to get just the base64-encoded bytes
    var data = img.replace(/^data:image\/\w+;base64,/, "");
    var buf = Buffer.from(data, "base64");
    res.contentType("image/png");
    res.send(buf);
  };

  exportBoard();
});

app.listen(port, '0.0.0.0', () => {
  console.log("app listening on port" + port);
  console.log(URL)
});
