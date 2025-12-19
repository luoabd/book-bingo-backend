# book-bingo-backend

Backend for the book bingo web application.

## Board Configuration

Board configurations are stored in `board-configs.json`. Each board type contains positioning data for covers, stars, and other elements.

### Configuration Structure

- `dimensions`: Canvas size (xCanvas, yCanvas)
- `grid`: Book cover positioning and sizing
- `stars`: Star ratings positioning and sizing
- `hardMode`: Hard mode indicator (optional)
- `features`: Array of enabled features like "hardMode", "extraStories"

