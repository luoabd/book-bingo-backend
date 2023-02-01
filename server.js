import fetch from "node-fetch";
import express from "express";
import * as dotenv from 'dotenv'

dotenv.config()
const app = express();
import cors from 'cors'

let corsOptions = {
  origin : ['http://localhost:3001'],
}
app.use(cors(corsOptions))

app.get("/api", function (req, res) {
  async function fetchBooksJSON() {
    const api_key = process.env.API_KEY;
    const fields =
      "items/volumeInfo(title,authors,industryIdentifiers,imageLinks)";
    const max = "5";
    const inputValue = req.query.search_q

    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${inputValue}&maxResults=${max}&key=${api_key}&fields=${fields}`
    );
    const books = await response.json();
    return books.items;
  }
  fetchBooksJSON().then((books) => {
    res.send(books);
  });
});

app.listen(3000, () => {
  console.log("app listening on port 3000");
});
