import { Router, type IRouter } from "express";
import healthRouter from "./health";
import simulationsRouter from "./simulations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(simulationsRouter);

export default router;
