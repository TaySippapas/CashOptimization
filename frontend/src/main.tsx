import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { routes } from "./app/routes";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";

const router = createBrowserRouter(routes);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
