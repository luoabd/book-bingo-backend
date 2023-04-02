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
    const resList = {};

    const response = await fetch(
      `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${inputValue}&search_type=books&per_page=10`
    );
    const body = await response.text();

    const $ = cheerio.load(body);

    $(".bookTitle").each((i, title) => {
      resList[i] = {};
      const titleNode = $(title);
      const titleText = titleNode.text().trim();
      resList[i].id = i;
      resList[i].title = titleText;
    });
    $(".bookCover").each((i, cover) => {
      const coverNode = $(cover);
      const coverSrc = coverNode.attr("src").replace(/_[^]+_./g, "");
      resList[i].imgLink = coverSrc;
    });
    $("a[href^='/work/editions/']").each((i, edition) => {
      const editionNode = $(edition);
      const editionSrc = editionNode.attr("href").match(/[^\D]+/g);
      resList[i].editionId = editionSrc[0];
    });

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
  let boardName = req.query.board;
  let fileName, xCanvas, yCanvas;
  let xCover, xCoverPad, yCover, yCoverPad, wCover, hCover;
  let xStar, yStarPad, wStar, hStar;
  let yHardMode, wHardMode, hHardMode;

  if (boardName === "fullybooked") {
    fileName = "fullybooked";
    xCover = 130;
    xCoverPad = 370;
    yCover = 332;
    yCoverPad = 400;
    wCover = 254;
    hCover = 316;
    xStar = 80;
    yStarPad = 60.5;
    wStar = 42;
    hStar = 44;
    xCanvas = 2000;
    yCanvas = 2300;
  } else {
    fileName = "rfantasy23";
    xCover = 89;
    xCoverPad = 338;
    yCover = 470;
    yCoverPad = 486;
    wCover = 204;
    hCover = 310;
    xStar = 40;
    yStarPad = 60.5;
    wStar = 40;
    hStar = 42;
    xCanvas = 1878;
    yCanvas = 3060;
    yHardMode = 775;
    wHardMode = 65;
    hHardMode = 65;
  }
  const canvas = createCanvas(xCanvas, yCanvas);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.font = "20px Calibri";

  loadImage(`./${fileName}.png`).then((image) => {
    ctx.drawImage(image, 0, 0);
  });

  const drawBoard = async () => {
    for (let i = 0; i < 5; i++) {
      let titlePad = i == 1 ? 530 : 486;
      let titleStart = i == 1 ? 370 : 414;
      for (let j = 0; j < 5; j++) {
        let idx = 5 * i + j;
        let prompt = req.body[idx];
        if (prompt.isFilled) {
          let titleText = prompt.title.split("(")[0];
          // Async shenanigans
          const drawCover = await loadImage(prompt.imgLink).then((image) => {
            if (boardName === "rfantasy") {
              printAtWordWrap(
                ctx,
                titleText,
                25 + xCoverPad / 2 + xCoverPad * j,
                titleStart + titlePad * i,
                20,
                320
              );
            }
            ctx.drawImage(
              image,
              xCover + xCoverPad * j,
              yCover + yCoverPad * i,
              wCover,
              hCover
            );
          });
          const drawStar = await loadImage("./star.png").then((image) => {
            for (let k = 0; k < prompt.starRating; k++)
              ctx.drawImage(
                image,
                xStar + xCoverPad * j,
                10 + yCover + k * yStarPad + yCoverPad * i,
                wStar,
                hStar
              );
          });
          if (boardName === "rfantasy" && prompt.hardMode) {
            const drawHardMode = await loadImage("./hm.png").then((image) => {
              ctx.drawImage(
                image,
                xStar - 12 + xCoverPad * j,
                yHardMode + yCoverPad * i,
                wHardMode,
                hHardMode
              );
            });
          }
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

function printAtWordWrap(context, text, x, y, lineHeight, fitWidth) {
  fitWidth = fitWidth || 0;

  if (fitWidth <= 0) {
    context.fillText(text, x, y);
    return;
  }
  var words = text.split(" ");
  var currentLine = 0;
  var idx = 1;
  while (words.length > 0 && idx <= words.length) {
    var str = words.slice(0, idx).join(" ");
    var w = context.measureText(str).width;
    if (w > fitWidth) {
      if (idx == 1) {
        idx = 2;
      }
      context.fillText(
        words.slice(0, idx - 1).join(" "),
        x,
        y + lineHeight * currentLine
      );
      currentLine++;
      words = words.splice(idx - 1);
      idx = 1;
    } else {
      idx++;
    }
  }
  if (idx > 0)
    context.fillText(words.join(" "), x, y + lineHeight * currentLine);
}

app.listen(port, "0.0.0.0", () => {
  console.log("app listening on port " + port);
});
