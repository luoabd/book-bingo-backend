import fetch from "node-fetch";
import express from "express";
import * as dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import cors from "cors";
import { config } from "./Constants.js";
import * as cheerio from "cheerio";
import sharp from "sharp";
import NodeCache from 'node-cache';
import { searchGames } from "./igdbService.js";
import { searchMedia } from './tmdbService.js';

dotenv.config();

const cache = new NodeCache({
  stdTTL: 3600, // 1hr
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false,
  maxKeys: 1000
});

// Middleware functions
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const cacheMiddleware = (cache, keyGenerator) => {
  return (req, res, next) => {
    const cacheKey = keyGenerator(req);
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      return res.send(cachedResult);
    }
    // Store cache key for later use in route handler
    req.cacheKey = cacheKey;
    next();
  };
};

const validateQuery = (param, validator) => {
  return (req, res, next) => {
    const value = req.query[param];
    if (!validator(value)) {
      return res.status(400).json({ error: `Invalid ${param}` });
    }
    next();
  };
};

const cacheResponse = (cache, key, data, ttl = 3600) => {
  cache.set(key, data, ttl);
  return data;
};

const app = express();
const URL = config.url;
const port = config.port;

let corsOptions = {
  origin: [URL],
};
app.use(cors(corsOptions));
app.use(express.json());

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Canvas board configurations
const BOARD_CONFIGS = {
  fullybooked25: {
    fileName: "fullybooked25",
    xCover: 59,
    xCoverPad: 263,
    yCover: 390,
    yCoverPad: 310,
    wCover: 205,
    hCover: 265,
    xStar: 110,
    yStarPad: 50.5,
    wStar: 33,
    hStar: 38,
    xCanvas: 2000,
    yCanvas: 2300
  },
  rfantasy: {
    fileName: (bodyLength) => bodyLength > 25 ? "rfantasy25_ss" : "rfantasy25",
    xCover: 89,
    xCoverPad: 338,
    yCover: 470,
    yCoverPad: 486,
    wCover: 204,
    hCover: 310,
    xStar: 40,
    yStarPad: 60.5,
    wStar: 40,
    hStar: 42,
    xCanvas: 1722,
    yCanvas: (bodyLength) => bodyLength > 25 ? 2911 : 2811,
    yHardMode: 775,
    wHardMode: 65,
    hHardMode: 65
  },
  bongo24: {
    fileName: "bongo24",
    xCover: 97,
    xCoverPad: 193,
    yCover: 635,
    yCoverPad: 220,
    wCover: 123,
    hCover: 178,
    xStar: 78,
    yStarPad: 32,
    wStar: 18,
    hStar: 20.5,
    xCanvas: 1080,
    yCanvas: 1920
  }
};

const PROMPT_LIST = [
  "Knights and Paladins",
  "Hidden Gem",
  "Published in the 80s",
  "High Fashion",
  "Down with the System",
  "Impossible Places",
  "A Book in Parts",
  "Gods and Pantheons",
  "Last in a Series",
  "Book Club or Readalong",
  "Parents",
  "Epistolary",
  "Published in 2025",
  "Author of Color",
  "Small Press or Self Published",
  "Biopunk",
  "Elves and Dwarves",
  "LGBGTQIA Protagonist",
  "Five Short Stories",
  "Stranger in a Strange Land",
  "Recycle A Bingo Square",
  "Cozy SFF",
  "Generic Title",
  "Not A Book",
  "Pirates",
];

// Helper functions
function getBoardConfig(boardName, bodyLength = 0) {
  const config = BOARD_CONFIGS[boardName];
  if (!config) {
    throw new Error(`Unknown board type: ${boardName}`);
  }

  // Handle dynamic properties
  return {
    ...config,
    fileName: typeof config.fileName === 'function' ? config.fileName(bodyLength) : config.fileName,
    yCanvas: typeof config.yCanvas === 'function' ? config.yCanvas(bodyLength) : config.yCanvas
  };
}

async function createCanvasWithBackground(fileName, xCanvas, yCanvas) {
  const canvas = createCanvas(xCanvas, yCanvas);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";

  try {
    const image = await loadImage(`./${fileName}.png`);
    ctx.drawImage(image, 0, 0);
  } catch (error) {
    console.error(`Failed to load background image: ${fileName}.png`, error);
    throw new Error('Failed to load board template');
  }

  return { canvas, ctx };
}

async function processBookCover(imgLink) {
  try {
    const coverBuffer = await getImageBuffer(imgLink);
    return await sharp(coverBuffer).toFormat("png").toBuffer();
  } catch (error) {
    console.error('Failed to process book cover:', error);
    throw new Error('Failed to process book cover image');
  }
}

async function drawBookCover(ctx, coverImg, config, i, j) {
  const image = await loadImage(coverImg);
  ctx.drawImage(
    image,
    config.xCover + config.xCoverPad * j,
    config.yCover + config.yCoverPad * i,
    config.wCover,
    config.hCover
  );
}

async function drawStars(ctx, config, prompt, i, j) {
  if (config.fileName.includes('fullybooked25')) return;

  const starImage = await loadImage("./star.png");
  for (let k = 0; k < prompt.starRating; k++) {
    ctx.drawImage(
      starImage,
      config.xStar + config.xCoverPad * j,
      10 + config.yCover + k * config.yStarPad + config.yCoverPad * i,
      config.wStar,
      config.hStar
    );
  }
}

async function drawHardMode(ctx, config, prompt, i, j) {
  if (config.fileName.includes('rfantasy') && prompt.hardMode) {
    const hmImage = await loadImage("./hm.png");
    ctx.drawImage(
      hmImage,
      config.xStar - 12 + config.xCoverPad * j,
      config.yHardMode + config.yCoverPad * i,
      config.wHardMode,
      config.hHardMode
    );
  }
}

async function drawPromptText(ctx, config, prompt, idx, i, j, promptStart) {
  if (!config.fileName.includes('rfantasy')) return;

  ctx.font = "bold 20px Calibri";
  const dummyImage = await loadImage("./star.png"); // Using star.png as dummy for text rendering
  printAtWordWrap(
    ctx,
    prompt.prompt || PROMPT_LIST[idx],
    25 + config.xCoverPad / 2 + config.xCoverPad * j,
    i == 0 ? promptStart : promptStart + 533 + 490 * (i - 1),
    20,
    320
  );
}

async function drawExtraStories(ctx, reqBody, config, promptStart) {
  if (!config.fileName.includes('rfantasy')) return;

  ctx.font = "bold 20px Calibri";
  const dummyImage = await loadImage("./star.png");
  printAtWordWrap(
    ctx,
    "Other short stories read:",
    25 + config.xCoverPad / 2,
    promptStart + 553 + 490 * 4,
    20,
    320
  );

  ctx.font = "20px Calibri";
  for (let i = 25; i < 29; i++) {
    const prompt = reqBody[i];
    if (!prompt?.isFilled) continue;

    const dummyImage2 = await loadImage("./star.png");
    printAtWordWrap(
      ctx,
      prompt.title.split("(")[0] + " by " + prompt.author,
      25 + config.xCoverPad / 2 + config.xCoverPad * ((i % 25) + 1),
      promptStart + 553 + 490 * 4,
      20,
      320
    );
  }
}

async function drawBoard(ctx, reqBody, config) {
  const promptStart = 325;

  for (let i = 0; i < 5; i++) {
    const titlePad = i == 1 ? 530 : 486;
    const titleStart = i == 1 ? 370 : 414;

    for (let j = 0; j < 5; j++) {
      const idx = 5 * i + j;
      const prompt = reqBody[idx];

      ctx.font = "20px Calibri";

      if (prompt?.isFilled) {
        const titleText = prompt.title.split("(")[0];

        const coverImg = await processBookCover(prompt.imgLink);
        await drawBookCover(ctx, coverImg, config, i, j);
        await drawStars(ctx, config, prompt, i, j);
        await drawHardMode(ctx, config, prompt, i, j);
        if (config.fileName.includes('rfantasy')) {
          printAtWordWrap(
            ctx,
            titleText,
            25 + config.xCoverPad / 2 + config.xCoverPad * j,
            titleStart + titlePad * i,
            20,
            320
          );
        }
      }

      await drawPromptText(ctx, config, prompt, idx, i, j, promptStart);
    }
  }

  await drawExtraStories(ctx, reqBody, config, promptStart);
}

async function generateBingoBoard(boardName, reqBody) {
  const config = getBoardConfig(boardName, reqBody.length);
  const { canvas, ctx } = await createCanvasWithBackground(config.fileName, config.xCanvas, config.yCanvas);

  await drawBoard(ctx, reqBody, config);

  const img = canvas.toDataURL();
  const data = img.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(data, "base64");
}
async function fetchSearchResults(inputValue) {
  const response = await fetch(
    `https://www.goodreads.com/search?utf8=%E2%9C%93&q=${inputValue}&search_type=books&per_page=10`
  );
  const body = await response.text();

  const $ = cheerio.load(body);

  const processBookTitles = () => {
    const titles = {};
    $(".bookTitle").each((i, title) => {
      titles[i] = {
        id: i,
        title: $(title).text().trim()
      };
    });
    return titles;
  };

  const processAuthors = () => {
    const authors = {};
    $("*[itemprop = 'author']").each((i, author) => {
      authors[i] = $(author).text().split("(")[0].trim().replace(/\n\n\n/g, "");
    });
    return authors;
  };

  const processCovers = () => {
    const covers = {};
    $(".bookCover").each((i, cover) => {
      covers[i] = $(cover).attr("src").replace(/_[^]+_./g, "");
    });
    return covers;
  };

  const processEditions = async () => {
    const editions = {};
    $("a[href^='/work/editions/']").each((i, edition) => {
      editions[i] = $(edition).attr("href").match(/[^\D]+/g);
    });
    return editions;
  };

  const [titles, authors, covers, editions] = await Promise.all([
    processBookTitles(),
    processAuthors(),
    processCovers(),
    processEditions()
  ]);

  // Combine results
  const resList = {};
  Object.keys(titles).forEach(i => {
    resList[i] = {
      ...titles[i],
      author: authors[i],
      imgLink: covers[i],
      edition: editions[i][0]
    };
  });

  return resList;
}

app.get("/scrape",
  validateQuery('search_q', (val) => val && val.length > 0),
  cacheMiddleware(cache, (req) => `search_${req.query.search_q.toLowerCase().trim()}`),
  asyncHandler(async (req, res) => {
    const resList = await fetchSearchResults(req.query.search_q);
    res.send(cacheResponse(cache, req.cacheKey, resList));
  })
);

async function fetchAltCovers(editionId) {
  const resList = [];
  let imgSrc = null;

  const response = await fetch(
    `https://www.goodreads.com/work/editions/${editionId}?sort=num_ratings&filter_by_format=Paperback&per_page=10`
  );
  const body = await response.text();

  const $ = cheerio.load(body);

  $("div.elementList").each((i, element) => {
    let englishEditionFound = false;

    $(element).find('div.editionData div.moreDetails div.dataRow').each((j, row) => {
      const dataTitle = $(row).find('.dataTitle').text().trim();
      const dataValue = $(row).find('.dataValue').text().trim();

    // Check if the DataTitle is 'Edition language:' and DataValue is 'English'
    if (dataTitle === 'Edition language:' && dataValue === 'English') {
      englishEditionFound = true;
      return false; // Stop searching as we've found the correct language
    }
    });

    if (englishEditionFound) {
      imgSrc = $(element).find('img').attr('src').replace(/_[^]+_./g, "");;
      resList.push(imgSrc);
    }

    if (resList.length >= 4) {
      return false; // Break out of the loop
    }

  });

  return resList;
}

app.get("/altcovers",
  validateQuery('edition_id', (val) => val && val.length > 0),
  asyncHandler(async (req, res) => {
    const resList = await fetchAltCovers(req.query.edition_id);
    res.send(resList);
  })
);

async function fetchBooksJSON(inputValue) {
  const api_key = process.env.API_KEY;
  const fields =
    "items/volumeInfo(title,authors,industryIdentifiers,imageLinks)";
  const max = "5";

  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${inputValue}&maxResults=${max}&fields=${fields}`
  );
  const books = await response.json();
  return books.items;
}

app.get("/api",
  validateQuery('search_q', (val) => val && val.length > 0),
  cacheMiddleware(cache, (req) => `google_books_${req.query.search_q.toLowerCase().trim()}`),
  asyncHandler(async (req, res) => {
    const books = await fetchBooksJSON(req.query.search_q);
    res.send(cacheResponse(cache, req.cacheKey, books));
  })
);

app.get("/games/search",
  validateQuery('q', (val) => val && val.length > 0),
  asyncHandler(async (req, res) => {
    const resList = await searchGames(req.query.q, cache);
    res.send(resList);
  })
);

app.get("/media/search",
  validateQuery('q', (val) => val && val.length > 0),
  asyncHandler(async (req, res) => {
    const resList = await searchMedia(req.query.q, cache);
    res.send(resList);
  })
);

app.post("/canvas",
  validateQuery('board', (val) => val && ['fullybooked25', 'rfantasy', 'bongo24'].includes(val)),
  asyncHandler(async (req, res) => {
    const boardBuffer = await generateBingoBoard(req.query.board, req.body);
    res.contentType("image/png");
    res.send(boardBuffer);
  })
);

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

app.get("/cache/stats", (req, res) => {
  res.json(cache.getStats());
});

app.post("/cache/clear", (req, res) => {
  // TODO: authorization
  cache.flushAll();
  res.json({ message: "Cache cleared successfully" });
});

app.listen(port, "0.0.0.0", () => {
  console.log("app listening on port " + port);
});
