import fetch from "node-fetch";
import express from "express";
import * as dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import cors from "cors";
import { config } from "./Constants.js";
import cheerio from "cheerio";
import sharp from "sharp";

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
  const promptList = [
    "First in a Series",
    "Alliterative Title",
    "Under the Surface",
    "Criminals",
    "Dreams",
    "Entitled Animals",
    "Bards",
    "Prologues and Epilogues",
    "Self Published / Indie",
    "Romantasy",
    "Dark Academia",
    "Multi POV",
    "Published in 2024",
    "Character with a Disability",
    "Published in the 90s",
    "Orcs, Trolls and Goblins",
    "Space Opera",
    "Author of Color",
    "Survival",
    "Judge a Book by its Cover",
    "Set in a Small Town",
    "Five Short Stories",
    "Eldritch Creatures",
    "Reference Materials",
    "Book Club or Readalong",
  ];

  if (boardName === "fullybooked24") {
    fileName = "fullybooked24";
    xCover = 155;
    xCoverPad = 370;
    yCover = 345;
    yCoverPad = 400;
    wCover = 205;
    hCover = 295;
    xStar = 110;
    yStarPad = 50.5;
    wStar = 33;
    hStar = 38;
    xCanvas = 2000;
    yCanvas = 2300;
  } else if (boardName === "rfantasy") {
    fileName = req.body.length > 25 ? "rfantasy24_ss" : "rfantasy24";
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
    xCanvas = 1722;
    yCanvas = req.body.length > 25 ? 3011 : 2811;
    yHardMode = 775;
    wHardMode = 65;
    hHardMode = 65;
  } else if (boardName === "bongo24") {
    fileName = "bongo24";
    xCover = 97;
    xCoverPad = 193;
    yCover = 635;
    yCoverPad = 220;
    wCover = 123;
    hCover = 178;
    xStar = 78;
    yStarPad = 32;
    wStar = 18;
    hStar = 20.5;
    xCanvas = 1080;
    yCanvas = 1920;
  }
  const canvas = createCanvas(xCanvas, yCanvas);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";

  loadImage(`./${fileName}.png`).then((image) => {
    ctx.drawImage(image, 0, 0);
  });

  const drawBoard = async () => {
    let promptStart = 325;
    for (let i = 0; i < 5; i++) {
      let titlePad = i == 1 ? 530 : 486;
      let titleStart = i == 1 ? 370 : 414;
      for (let j = 0; j < 5; j++) {
        let idx = 5 * i + j;
        let prompt = req.body[idx];
        ctx.font = "20px Calibri";
        if (prompt.isFilled) {
          let titleText = prompt.title.split("(")[0];
          // Async shenanigans
          // Convert all cover to JPG as there is no way to distinguish
          // between webp and jpg on the goodreads response
          const coverBuffer = await getImageBuffer(prompt.imgLink);
          const coverImg = await sharp(coverBuffer).toFormat("png").toBuffer();

          const drawCover = await loadImage(coverImg).then((image) => {
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
        if (boardName === "rfantasy") {
          ctx.font = "bold 20px Calibri";
          // TODO: Needs to be improved
          const drawPrompt = await loadImage("./star.png").then((image) => {
            printAtWordWrap(
              ctx,
              prompt.prompt || promptList[idx],
              25 + xCoverPad / 2 + xCoverPad * j,
              i == 0 ? promptStart : promptStart + 533 + 490 * (i - 1),
              20,
              320
            );
          });
        }
      }
    }
    if (boardName === "rfantasy") {
      ctx.font = "bold 20px Calibri";
      const drawText = await loadImage("./star.png").then(() => {
        printAtWordWrap(
          ctx,
          "Other short stories read:",
          25 + xCoverPad / 2,
          promptStart + 553 + 490 * 4,
          20,
          320
        );
      });
      // TODO: Needs to be improved
      for (let i = 25; i < 29; i++) {
        let prompt = req.body[i];
        if (prompt.isFilled == false)
          continue;
        const drawStories = await loadImage("./star.png").then(() => {
          printAtWordWrap(
            ctx,
            prompt.title.split("(")[0] + " by ",
            25 + xCoverPad / 2 + xCoverPad * ((i % 25) + 1),
            promptStart + 553 + 490 * 4,
            20,
            320
          );
        });
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

async function getImageBuffer(imageUrl) {
  const response = await fetch(imageUrl);
  const imgResponse = response.arrayBuffer();
  return imgResponse;
}

app.listen(port, "0.0.0.0", () => {
  console.log("app listening on port " + port);
});
