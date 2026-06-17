const express = require("express");
const _ = require("lodash");

const app = express();

app.get("/", (req, res) => {
  res.send(_.template("Hello <%= name %>")({ name: "Frogbot" }));
});

app.listen(3000, () => console.log("listening on :3000"));
