
    let fileName, xCanvas, yCanvas;
    let xCover, xCoverPad, yCover, yCoverPad, wCover, hCover;
    let xStar, yStarPad, wStar, hStar;

    fileName = "fullybooked24";
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

    loadImage(`./${fileName}.png`).then((image) => {
      ctx.drawImage(image, 0, 0);
    });

    const drawBoard = async () => {
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          let idx = 5 * i + j;
          let prompt = req.body[idx];
          ctx.font = "20px Calibri";
          if (prompt.isFilled) {
            // Async shenanigans
            // Convert all cover to JPG as there is no way to distinguish
            // between webp and jpg on the goodreads response
            const coverBuffer = await getImageBuffer(prompt.imgLink);
            const coverImg = await sharp(coverBuffer).toFormat("png").toBuffer();

            const drawCover = await loadImage(coverImg).then((image) => {
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
          }
        }
      }
    };
