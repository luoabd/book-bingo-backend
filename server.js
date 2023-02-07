import fetch from "node-fetch";
import express from "express";
import * as dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import cors from "cors";
import { config } from "./Constants.js";
import cheerio from "cheerio";

dotenv.config();

const app = express();
const URL = config.url;
const port = config.port;

let corsOptions = {
  origin: [URL],
};
app.use(cors(corsOptions));
app.use(express.json());

app.get("/scrape", function (req, res) {

  async function fetchSearchResults() {
    const inputValue = req.query.search_q;
    const resList = {}

    const response = await fetch(
      `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${inputValue}&search_type=books`
    );
    const body = await response.text();
    
    const $ = cheerio.load(body)

    $('.bookTitle').each((i, title) => {
      resList[i] = {}
      const titleNode = $(title)
      const titleText = titleNode.text().trim();
      resList[i].id = i;
      resList[i].title = titleText;
      
    })
    $('.bookCover').each((i, cover) => {
      const coverNode = $(cover)
      const coverSrc = coverNode.attr('src').replace(/_[^]+_./g,"");
      resList[i].imgLink = coverSrc;
    })

    return resList;
  }
  fetchSearchResults().then((resList) => {
    res.send(resList);
  });
});
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
          const drawCover = await loadImage(prompt.imgLink).then((image) => {
            ctx.drawImage(image, 130 + 370 * j, 332 + 400 * i, 254, 316);
          });
          const drawStar = await loadImage("./star.png").then((image) => {
            for (let k = 0; k < prompt.starRating; k++)
              ctx.drawImage(
                image,
                80 + 370 * j,
                332 + k * 60.5 + 400 * i,
                42,
                44
              );
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

app.listen(port, "0.0.0.0", () => {
  console.log("app listening on port " + port);
});
