import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentRouter from "./agent";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentRouter);
router.use(openaiRouter);

export default router;
