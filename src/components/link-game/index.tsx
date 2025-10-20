import React, { useState, useEffect, useRef, useCallback } from "react";
import classNames from "classnames";
import { Player } from "@lottiefiles/react-lottie-player";
import PawSteps from "./components/paw-steps";
import LinkGameEngine, { CellInfo, GameOverType } from "./LinkGameEngine";
import lottieStarBling from "/lottie/phonics/star-bling.json?url";
import lottieStarHint from "/lottie/phonics/star-hint.json?url";
import lottieTimeShake from "/lottie/phonics/time-shake.json?url";

import "./style.less";

interface SelectedCell {
  row: number;
  col: number;
}

const scale = document.documentElement.clientWidth / 1280;
// 游戏配置参数 - 直接指定行列数
const layoutConfig = {
  gameRows: 3,
  gameCols: 4,
  cellWidth: 110 * scale,
  cellHeight: 110 * scale,
  gapX: 42 * scale,
  gapY: 35 * scale,
};

const gameConfig = {
  rows: layoutConfig.gameRows + 2, // 加2是因为引擎需要边界
  cols: layoutConfig.gameCols + 2, // 加2是因为引擎需要边界
  initialTime: 60 * 2, // 初始倒计时时间
};

/**
 * 18.连连看
 * @param param0
 * @returns
 */
const LinkGame: React.FC = () => {
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [steps, setSteps] = useState<number>(0);
  const [leftTime, setLeftTime] = useState<number>(0);
  const [gameMap, setGameMap] = useState<CellInfo[][]>([]);
  const [isWin, setIsWin] = useState(false);

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [animatingCells, setAnimatingCells] = useState<Set<string>>(new Set());
  const [shakeCells, setShakeCells] = useState<
    {
      row: number;
      col: number;
      letter: string;
    }[]
  >([]);
  const [hintCells, setHintCells] = useState<
    {
      row: number;
      col: number;
      letter: string;
    }[]
  >([]);

  const gameEngineRef = useRef<LinkGameEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameGridRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number[]>([]);

  // 初始化游戏引擎
  useEffect(() => {
    const engine = new LinkGameEngine(gameConfig);

    // 设置初始时间
    setLeftTime(gameConfig.initialTime);

    engine.onTimeUpdate = (time) => {
      setLeftTime(time);
    };

    engine.onSelectedCellChange = (cellInfo: SelectedCell | null) => {
      setSelectedCell(cellInfo);
    };

    engine.onGameOver = (type: GameOverType) => {
      // 1正常消完 2步数超过 3时间超过
      setIsGameOver(true);
      setIsWin(type === GameOverType.Normal);
    };

    engine.onMapUpdate = (
      pictures: CellInfo[][],
      _rows: number,
      _cols: number
    ) => {
      setGameMap(pictures);
    };

    engine.onDrawLine = (
      points: number[][],
      callback?: () => void,
      onError?: () => void
    ) => {
      drawLine(points, callback, onError);
    };

    engine.onAnimationStart = (cells: { row: number; col: number }[]) => {
      const cellKeys = cells.map((cell) => `${cell.row}-${cell.col}`);
      setAnimatingCells(new Set(cellKeys));
    };

    engine.onShakeEffect = (
      cells: { row: number; col: number; letter: string }[]
    ) => {
      setShakeCells(cells);
    };

    engine.onStepUpdate = (newSteps: number) => {
      setSteps(newSteps);
    };

    engine.onTargetLetterEliminated = () => {
      console.log("目标字母消除成功");
    };

    engine.onHint = (cells: { row: number; col: number; letter: string }[]) => {
      setHintCells(cells);
    };

    gameEngineRef.current = engine;

    // 设置目标字母
    engine.setTargetLetter("A");

    // 自动开始游戏
    const timer = setTimeout(() => {
      engine.startGame();
    }, 100);
    const timeIds = timerRef.current;
    timeIds.push(timer);
    return () => {
      if (engine) {
        engine.destroy();
      }
      timeIds.forEach((timer) => clearTimeout(timer));
    };
  }, [layoutConfig.gameRows, layoutConfig.gameCols]);

  // 动态设置canvas大小
  useEffect(() => {
    const updateCanvasSize = () => {
      if (gameGridRef.current && canvasRef.current) {
        const gameGrid = gameGridRef.current;
        const canvas = canvasRef.current;
        const rect = gameGrid.getBoundingClientRect();

        // 设置canvas为game-grid的1.2倍
        canvas.width = rect.width * 1.2;
        canvas.height = rect.height * 1.2;
      }
    };

    // 初始设置
    updateCanvasSize();
  }, [gameMap]);

  // 重新开始游戏
  const restartGame = useCallback(() => {
    if (gameEngineRef.current) {
      gameEngineRef.current.restartGame();
      setIsGameOver(false);
    }
  }, []);

  // 处理点击事件
  const handleCellClick = useCallback(
    (row: number, col: number, index: number) => {
      if (gameEngineRef.current) {
        gameEngineRef.current.handleCellClick(row, col, index);
      }
    },
    []
  );

  const handleSuccess = useCallback(() => {}, []);

  const handleError = useCallback(() => {}, []);

  // 绘制连线
  const drawLine = useCallback(
    (points: number[][], onSuccess?: () => void, onError?: () => void) => {
      const canvas = canvasRef.current;
      if (!canvas || !points || points.length < 2) {
        console.log("注意哦，连线不能超过两个弯，你肯定能做到！");
        handleError();
        const timer = setTimeout(() => {
          if (onError) onError();
        }, 1000);
        timerRef.current.push(timer);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#b370ff";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // 转换逻辑坐标为像素坐标
      const toPixel = (point: number[]) => {
        const [x, y] = point;
        if (!gameGridRef.current) {
          return [0, 0];
        }
        // 获取game-grid的实际尺寸
        const gameGridRect = gameGridRef.current.getBoundingClientRect();
        const gameGridWidth = gameGridRect.width;
        const gameGridHeight = gameGridRect.height;

        // canvas是120%大小且居中，所以需要计算偏移
        const canvasWidth = gameGridWidth * 1.2;
        const canvasHeight = gameGridHeight * 1.2;
        const offsetX = (canvasWidth - gameGridWidth) / 2;
        const offsetY = (canvasHeight - gameGridHeight) / 2;

        // 计算格子中心点的实际像素坐标
        // x-1 和 y-1 是因为逻辑坐标从1开始，而实际渲染从0开始
        const pixelX =
          (x - 1) * (layoutConfig.cellWidth + layoutConfig.gapX) +
          layoutConfig.cellWidth / 2 +
          offsetX;
        const pixelY =
          (y - 1) * (layoutConfig.cellHeight + layoutConfig.gapY) +
          layoutConfig.cellHeight / 2 +
          offsetY;

        return [pixelX, pixelY];
      };

      // 生成直角路径点
      const generateRectangularPath = (points: number[][]) => {
        if (points.length < 2) return points.map(toPixel);

        const path = [toPixel(points[0])];

        for (let i = 1; i < points.length; i++) {
          const current = toPixel(points[i]);
          const prev = path[path.length - 1];

          // 如果不是水平或垂直线，需要添加转折点
          if (current[0] !== prev[0] && current[1] !== prev[1]) {
            // 添加中间转折点，优先水平移动
            path.push([current[0], prev[1]]);
          }

          path.push(current);
        }

        return path;
      };

      const pathPoints = generateRectangularPath(points);

      if (pathPoints.length < 2) return;

      // 限制路径点在canvas边界内
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const clampedPoints = pathPoints.map(([x, y]) => [
        Math.max(5, Math.min(canvasWidth - 5, x)),
        Math.max(5, Math.min(canvasHeight - 5, y)),
      ]);

      ctx.beginPath();
      ctx.moveTo(clampedPoints[0][0], clampedPoints[0][1]);

      // 绘制带圆角的直角连线
      for (let i = 1; i < clampedPoints.length; i++) {
        const current = clampedPoints[i];
        const prev = clampedPoints[i - 1];

        // 如果是最后一段或者没有下一段，直接连线
        if (i === clampedPoints.length - 1) {
          ctx.lineTo(current[0], current[1]);
        } else {
          const next = clampedPoints[i + 1];
          const radius = 20;

          // 检查是否需要圆角（当前点是转折点）
          const prevDir = [current[0] - prev[0], current[1] - prev[1]];
          const nextDir = [next[0] - current[0], next[1] - current[1]];

          // 如果方向改变，说明是转折点，需要圆角
          const isCorner =
            (prevDir[0] !== 0 && nextDir[1] !== 0) ||
            (prevDir[1] !== 0 && nextDir[0] !== 0);

          if (isCorner) {
            // 计算圆角的起点和终点
            const prevLen = Math.sqrt(
              prevDir[0] * prevDir[0] + prevDir[1] * prevDir[1]
            );
            const nextLen = Math.sqrt(
              nextDir[0] * nextDir[0] + nextDir[1] * nextDir[1]
            );

            if (prevLen > 0 && nextLen > 0) {
              const adjustedRadius = Math.min(radius, prevLen / 2, nextLen / 2);

              const prevUnit = [prevDir[0] / prevLen, prevDir[1] / prevLen];
              const nextUnit = [nextDir[0] / nextLen, nextDir[1] / nextLen];

              const cornerStart = [
                current[0] - prevUnit[0] * adjustedRadius,
                current[1] - prevUnit[1] * adjustedRadius,
              ];

              const cornerEnd = [
                current[0] + nextUnit[0] * adjustedRadius,
                current[1] + nextUnit[1] * adjustedRadius,
              ];

              // 画到圆角起点
              ctx.lineTo(cornerStart[0], cornerStart[1]);
              // 画圆角
              ctx.quadraticCurveTo(
                current[0],
                current[1],
                cornerEnd[0],
                cornerEnd[1]
              );
            } else {
              ctx.lineTo(current[0], current[1]);
            }
          } else {
            ctx.lineTo(current[0], current[1]);
          }
        }
      }

      ctx.stroke();
      handleSuccess();
      // 1秒后清除连线并执行成功回调
      const timer = setTimeout(() => {
        // 清除连线和星星动画
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setAnimatingCells(new Set());
        if (onSuccess) onSuccess(); // 成功回调：消除格子和动画
      }, 1000);
      timerRef.current.push(timer);
    },
    []
  );

  // 格式化时间为分:秒格式
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return (
      <>
        <span>{minutes}</span>
        <span>:</span>
        <span>{remainingSeconds.toString().padStart(2, "0")}</span>
      </>
    );
  };

  // 渲染游戏地图
  const renderGameMap = () => {
    if (!gameMap || gameMap.length === 0) return null;

    const rows = [];
    for (let i = 1; i < gameMap.length - 1; i++) {
      const cells = [];
      for (let j = 1; j < gameMap[i].length - 1; j++) {
        const cell = gameMap[i][j];
        const isSelected =
          (selectedCell && selectedCell.row === i && selectedCell.col === j) ||
          animatingCells.has(`${i}-${j}`);
        const isShaking = shakeCells.find(
          (shakeCell) => shakeCell.row === i && shakeCell.col === j
        );
        const isHint = hintCells.find(
          (hintCell) => hintCell.row === i && hintCell.col === j
        );

        cells.push(
          <div
            key={`${i}-${j}`}
            className={classNames("game-cell", {
              active: isSelected,
              shake: !!isShaking,
            })}
          >
            {!cell.isEmpty && (
              <div
                className={"letter-box"}
                data-row={i}
                data-col={j}
                data-index={cell.index}
                onClick={() => {
                  handleCellClick(i, j, cell.index || 0);
                }}
              >
                <span className="letter">{cell.pic}</span>
                {animatingCells.has(`${i}-${j}`) && (
                  <Player
                    className="lottie-star-bling"
                    src={lottieStarBling}
                    autoplay
                    loop
                    keepLastFrame={false}
                    renderer="svg"
                  />
                )}
                {isHint && (
                  <Player
                    className="lottie-star-hint"
                    src={lottieStarHint}
                    autoplay
                    loop
                    keepLastFrame={false}
                    renderer="svg"
                  />
                )}
              </div>
            )}
          </div>
        );
      }
      rows.push(
        <div key={i} className="game-row">
          {cells}
        </div>
      );
    }

    return (
      <>
        <div id="game" className="game-grid" ref={gameGridRef}>
          {rows}
        </div>
        <canvas ref={canvasRef} id="canvas" />
      </>
    );
  };

  return (
    <div className="link-game-wrapper">
      <div className="game-area">{renderGameMap()}</div>
      <div className="step">
        步数
        <div className="step-inner">
          <PawSteps steps={steps} maxSteps={6} />
          <span>{steps}/6</span>
        </div>
      </div>
      <div className="countdown">
        <Player
          className="time-shake"
          src={lottieTimeShake}
          autoplay
          keepLastFrame
          renderer="svg"
        />
        <div className="countdown-inner">{formatTime(leftTime)}</div>
      </div>
    </div>
  );
};

export default LinkGame;
