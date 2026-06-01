import * as reportService from "../services/reportService.js";
import { sendError } from "../utils/http.js";

export const getMyReports = async (req, res) => {
  try {
    res.json(await reportService.getMyReports(req.userId));
  } catch (error) {
    console.error("Report list failed:", error);
    sendError(res, error, "report list failed");
  }
};

export const createReport = async (req, res) => {
  try {
    const report = await reportService.createReport({
      reporterId: req.userId,
      body: req.body,
    });
    res.status(201).json(report);
  } catch (error) {
    console.error("Report create failed:", error);
    sendError(res, error, "report create failed");
  }
};
