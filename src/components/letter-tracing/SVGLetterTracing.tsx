import React, { useState, useRef, useCallback, useEffect } from "react";
import classNames from "classnames";
import {
  parseSVGPaths,
  StrokeInfo,
  Point,
  samplePathPoints,
} from "./svgParser";

// 动态收集字母 SVG 模块
const LETTER_MODULES = import.meta.glob<string>("../../assets/letters/*.svg", {
  query: "?raw",
  import: "default",
  eager: false,
});

// 默认SVG尺寸
const defaultSvgSize = {
  width: 250,
  height: 250,
};
const strokeWidth = 40;
export const SVGLetterTracing: React.FC<{
  letter: string;
  isBold?: boolean;
  setFinishInfo?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ letter, setFinishInfo }) => {
  const [currentStroke, setCurrentStroke] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [userPaths, setUserPaths] = useState<{ d: string }[]>([]);

  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [_progress, setProgress] = useState(0); // 当前笔画进度 0-1
  const [maxProgress, setMaxProgress] = useState(0); // 最大进度，防止倒退
  const maxProgressRef = useRef(0); // 用于获取实时的最大进度值

  const [strokes, setStrokes] = useState<StrokeInfo[]>([]);
  const [svgSize, setSvgSize] = useState<{ width: number; height: number }>(
    defaultSvgSize
  );
  const [svgRect, setSvgRect] = useState<DOMRect>(new DOMRect());
  useEffect(() => {
    setFinishInfo &&
      setFinishInfo((pre) => ({
        ...pre,
        [letter]: currentStroke >= strokes.length,
      }));
  }, [strokes, currentStroke, setFinishInfo, letter]);

  const svgRef = useRef<SVGSVGElement>(null);

  // 上一次触摸的原始点（SVG坐标），用于插值
  const lastTouchPointRef = useRef<Point | null>(null);
  // 保存原始笔画（不带点和长度）
  const [baseStrokes, setBaseStrokes] = useState<
    Array<Omit<StrokeInfo, "points" | "length">>
  >([]);

  // 渲染箭头的函数
  const renderArrows = (strokeInfo: StrokeInfo, keyPrefix?: string) => {
    const isCircular = strokeInfo.isCircular || false;
    const arrowCount = isCircular ? 3 : 1;

    return [...Array(arrowCount)].map((_, i) => {
      const pts = strokeInfo.points;
      let t;

      if (arrowCount === 1) {
        // 直线类型，只在末尾显示一个箭头
        t = 0.98; // 在98%位置显示箭头
      } else {
        // 圆形类型，显示3个箭头
        t = (i + 1) / arrowCount;
      }

      const pointIndex = Math.floor(t * (pts.length - 1));
      const point1 = pts[Math.max(0, pointIndex - 1)];
      const point2 = pts[pointIndex] || pts[pts.length - 1];

      const dx = point2.x - point1.x;
      const dy = point2.y - point1.y;
      const angle = Math.atan2(dy, dx);
      const arrowLength = 6;
      const arrowAngle = Math.PI / 6;

      const key = keyPrefix ? `${keyPrefix}-arrow-${i}` : i;

      return (
        // eslint-disable-next-line react/no-array-index-key
        <g key={key}>
          <path
            stroke="#b370ff"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            d={`M${point2.x - arrowLength * Math.cos(angle - arrowAngle)},${
              point2.y - arrowLength * Math.sin(angle - arrowAngle)
            } L${point2.x},${point2.y} L${
              point2.x - arrowLength * Math.cos(angle + arrowAngle)
            },${point2.y - arrowLength * Math.sin(angle + arrowAngle)}`}
          />
        </g>
      );
    });
  };

  // 离散化路径为点集
  const discretizePath = useCallback(
    (pathString: string, numPoints = 200): Point[] => {
      return samplePathPoints(
        pathString,
        numPoints,
        (i, numPoints, totalLength) => {
          return (i / numPoints) * totalLength;
        }
      );
    },
    []
  );

  // 根据原始笔画生成可渲染的笔画
  const recomputeStrokes = useCallback(
    (
      rawStrokes: Array<Omit<StrokeInfo, "points" | "length">>
    ): StrokeInfo[] => {
      // 为路径计算离散点和长度
      return rawStrokes.map((s) => {
        const pts = discretizePath(s.path);
        let length = 0;
        for (let i = 1; i < pts.length; i++) {
          length += Math.hypot(
            pts[i].x - pts[i - 1].x,
            pts[i].y - pts[i - 1].y
          );
        }
        return { ...s, points: pts, length } as StrokeInfo;
      });
    },
    [discretizePath]
  );

  // 动态加载SVG，规则：大写 -> '@/assets/letters/_A.svg'，小写 -> '@/assets/letters/a.svg'
  const loadLetterSVG = useCallback(
    async (name: string): Promise<string | null> => {
      try {
        const isUpper = /^[A-Z]$/.test(name);
        const fileName = isUpper ? `_${name}.svg` : `${name}.svg`;
        const key = Object.keys(LETTER_MODULES).find((p) =>
          p.endsWith(`letters/${fileName}`)
        );
        if (!key) return null;
        const loader = LETTER_MODULES[key] as unknown as () => Promise<string>;
        const svgRaw: string = await loader();
        return svgRaw;
      } catch (e) {
        console.error("动态加载SVG失败:", e);
        return null;
      }
    },
    []
  );

  // 根据选中字母，使用动态加载的SVG文本解析出笔画
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const svgRaw = await loadLetterSVG(letter);
      if (!svgRaw) {
        setBaseStrokes([]);
        setStrokes([]);
        setSvgSize(defaultSvgSize);
        return;
      }
      try {
        // 解析SVG内容和尺寸
        const result = parseSVGPaths(svgRaw, letter);
        if (cancelled) return;

        setSvgSize(result.dimensions);
        setBaseStrokes(result.strokes);

        setCurrentStroke(0);
        setUserPaths([]);
        setCurrentPath([]);
        setIsDrawing(false);
        setProgress(0);
        setMaxProgress(0);
        maxProgressRef.current = 0;
      } catch (e) {
        console.error("解析字母SVG失败:", e);
        setBaseStrokes([]);
        setStrokes([]);
        setSvgSize(defaultSvgSize);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [letter, loadLetterSVG]);

  // 重置
  const reset = useCallback(() => {
    setCurrentStroke(0);
    setUserPaths([]);
    setCurrentPath([]);
    setIsDrawing(false);
    setProgress(0);
    setMaxProgress(0);
    maxProgressRef.current = 0;
  }, []);

  // 当路径修改配置或原始笔画变化时，重新生成strokes
  useEffect(() => {
    if (baseStrokes.length === 0) return;
    const withPoints = recomputeStrokes(baseStrokes);
    setStrokes(withPoints);
    // 修改了路径，重置当前绘制状态，避免错位
    reset();
  }, [baseStrokes, recomputeStrokes, reset]);

  // 计算点到路径的最近点和距离
  const findClosestPointOnPath = useCallback(
    (
      point: Point,
      strokeIndex: number
    ): { closestPoint: Point; distance: number; progress: number } => {
      const stroke = strokes[strokeIndex];
      if (!stroke || !stroke.points.length)
        return { closestPoint: point, distance: Infinity, progress: 0 };

      const pts = stroke.points;
      const n = pts.length;
      const currentIdx = Math.floor(maxProgressRef.current * (n - 1));

      // 动态调整搜索窗口
      const baseBackWindow = Math.floor(0.08 * n);
      const adaptiveExtra = n < 120 ? Math.floor(0.08 * (120 - n)) : 0;
      const backWindow = Math.max(6, baseBackWindow + adaptiveExtra);
      const startIdx = Math.max(0, currentIdx - backWindow);

      // 第一阶段：找到所有距离较近的候选点
      const candidates: Array<{
        index: number;
        distance: number;
        progress: number;
        point: Point;
      }> = [];

      let globalMinDistance = Infinity;

      for (let i = startIdx; i < n; i++) {
        const pathPoint = pts[i];
        const dx = point.x - pathPoint.x;
        const dy = point.y - pathPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < globalMinDistance) {
          globalMinDistance = distance;
        }

        candidates.push({
          index: i,
          distance,
          progress: i / (n - 1),
          point: pathPoint,
        });
      }

      // 第二阶段：筛选距离在合理范围内的候选点
      const distanceThreshold = Math.max(2, globalMinDistance + 3);
      const validCandidates = candidates.filter(
        (c) => c.distance <= distanceThreshold
      );

      if (validCandidates.length === 0) {
        const fallback = candidates[0] || {
          index: currentIdx,
          distance: Infinity,
          progress: maxProgressRef.current,
          point: pts[currentIdx] || point,
        };
        return {
          closestPoint: fallback.point,
          distance: fallback.distance,
          progress: fallback.progress,
        };
      }

      // 第三阶段：智能选择最佳候选点
      let bestCandidate = validCandidates[0];

      for (const candidate of validCandidates) {
        const progressDiff = candidate.progress - maxProgressRef.current;
        const bestProgressDiff =
          bestCandidate.progress - maxProgressRef.current;

        // 优先选择进度向前的点
        if (progressDiff >= -0.03 && bestProgressDiff < -0.03) {
          bestCandidate = candidate;
          continue;
        }

        // 如果都是向前或都是向后，选择距离更近且进度跳跃更小的
        if (progressDiff >= -0.03 === bestProgressDiff >= -0.03) {
          const distanceScore = candidate.distance;
          const bestDistanceScore = bestCandidate.distance;

          const progressJump = Math.abs(progressDiff);
          const bestProgressJump = Math.abs(bestProgressDiff);

          // 综合评分：距离权重0.6，进度跳跃权重0.4
          const score = distanceScore * 0.6 + progressJump * 40;
          const bestScore = bestDistanceScore * 0.6 + bestProgressJump * 40;

          if (score < bestScore) {
            bestCandidate = candidate;
          }
        }
      }

      return {
        closestPoint: bestCandidate.point,
        distance: bestCandidate.distance,
        progress: bestCandidate.progress,
      };
    },
    [strokes]
  );

  // 获取SVG坐标
  const getSVGPoint = useCallback(
    (e: React.TouchEvent, rect?: DOMRect): Point => {
      if (!svgRef.current) return { x: 0, y: 0 };

      const clientX = e.touches[0]?.clientX || 0;
      const clientY = e.touches[0]?.clientY || 0;
      const currentRect = rect || svgRect;
      // 转换为SVG坐标系
      const x =
        ((clientX - currentRect.left) / currentRect.width) * svgSize.width;
      const y =
        ((clientY - currentRect.top) / currentRect.height) * svgSize.height;

      return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
    },
    [svgSize, svgRect]
  );

  // 开始绘制
  const handleStart = useCallback(
    (e: React.TouchEvent) => {
      // 每次开始时清空上一次触摸点，避免沿用上一次的尾巴
      lastTouchPointRef.current = null;
      if (currentStroke >= strokes.length || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      setSvgRect(rect);
      const point = getSVGPoint(e, rect);
      const stroke = strokes[currentStroke];
      if (!stroke) return;

      // 如果是点击式的点，直接完成这个笔画
      if (stroke.isDot) {
        const dotDistance = Math.hypot(
          point.x - stroke.startPoint.x,
          point.y - stroke.startPoint.y
        );

        if (dotDistance <= 30) {
          // 直接完成点击式的点
          setUserPaths((prev) => [...prev, { d: stroke.path }]);
          setCurrentStroke((prev) => prev + 1);
        }
        return;
      }

      // 检查是否在起点附近
      const startDistance = Math.hypot(
        point.x - stroke.startPoint.x,
        point.y - stroke.startPoint.y
      );

      if (startDistance <= 50) {
        setIsDrawing(true);
        setCurrentPath([stroke.startPoint]);
        setProgress(0);
        setMaxProgress(0);
        // 记录开始点
        lastTouchPointRef.current = point;
      }
    },
    [currentStroke, strokes, getSVGPoint]
  );

  // 在路径上按进度获取点的辅助函数
  const getPointByProgress = useCallback(
    (stroke: StrokeInfo, progress: number): Point => {
      if (!stroke.points || stroke.points.length === 0) {
        return stroke.startPoint;
      }

      const clampedProgress = Math.max(0, Math.min(1, progress));
      const index = clampedProgress * (stroke.points.length - 1);
      const lowerIndex = Math.floor(index);
      const upperIndex = Math.ceil(index);

      if (lowerIndex === upperIndex) {
        return stroke.points[lowerIndex] || stroke.startPoint;
      }

      const t = index - lowerIndex;
      const p1 = stroke.points[lowerIndex];
      const p2 = stroke.points[upperIndex];

      return {
        x: Number((p1.x + (p2.x - p1.x) * t).toFixed(2)),
        y: Number((p1.y + (p2.y - p1.y) * t).toFixed(2)),
      };
    },
    []
  );

  // 在两个触摸点之间进行插值的函数
  const interpolatePoints = useCallback(
    (startPoint: Point, endPoint: Point, strokeIndex: number): Point[] => {
      const stroke = strokes[strokeIndex];
      if (!stroke) return [endPoint];

      // 计算两点之间的距离
      const distance = Math.hypot(
        endPoint.x - startPoint.x,
        endPoint.y - startPoint.y
      );

      // 如果距离很小，不需要插值
      if (distance < 15) return [endPoint];

      // 基于距离决定插值点数量，距离越大插值越多
      const interpolationSteps = Math.min(Math.floor(distance / 10), 8);

      if (interpolationSteps <= 1) return [endPoint];

      const interpolatedPoints: Point[] = [];

      // 获取起点在路径上的最佳匹配
      const startResult = findClosestPointOnPath(startPoint, strokeIndex);
      const endResult = findClosestPointOnPath(endPoint, strokeIndex);

      // 如果任一点距离路径太远，直接返回终点
      if (startResult.distance > 30 || endResult.distance > 30) {
        return [endPoint];
      }

      // 在路径progress之间插值
      const progressStart = startResult.progress;
      const progressEnd = endResult.progress;

      // 如果progress倒退太多，只返回终点
      if (progressEnd < progressStart - 0.1) {
        return [endPoint];
      }

      // 在两个progress之间插值
      for (let i = 1; i <= interpolationSteps; i++) {
        const t = i / interpolationSteps;
        const interpolatedProgress =
          progressStart + (progressEnd - progressStart) * t;

        // 检查插值进度是否合理
        if (
          interpolatedProgress >= maxProgressRef.current - 0.05 &&
          interpolatedProgress - maxProgressRef.current <= 0.35
        ) {
          const interpolatedPoint = getPointByProgress(
            stroke,
            interpolatedProgress
          );
          interpolatedPoints.push(interpolatedPoint);
        }
      }

      return interpolatedPoints.length > 0 ? interpolatedPoints : [endPoint];
    },
    [strokes, findClosestPointOnPath, getPointByProgress]
  );

  // 绘制过程中（包含反向与跳跃的限制）
  const handleMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDrawing || currentStroke >= strokes.length) return;

      const point = getSVGPoint(e);
      const result = findClosestPointOnPath(point, currentStroke);

      const attractRadius = 20;

      if (result.distance <= attractRadius) {
        const minRequiredProgress = maxProgressRef.current - 0.05; // 允许5%回退

        // 根据路径长度动态调整最大允许跳跃距离
        const currentStrokeInfo = strokes[currentStroke];
        const pathLength = currentStrokeInfo?.length || 0;

        let maxAllowedJump;
        if (pathLength < 150) {
          maxAllowedJump = 0.35;
        } else {
          maxAllowedJump = 0.2;
        }
        const progressDiff = result.progress - maxProgressRef.current;
        // console.log(progressDiff > maxAllowedJump);
        // 如果跳跃过大，尝试使用插值
        if (
          result.progress >= minRequiredProgress &&
          progressDiff > maxAllowedJump
        ) {
          const lastPoint = lastTouchPointRef.current;

          if (lastPoint) {
            // 使用插值生成中间点
            const interpolatedPoints = interpolatePoints(
              lastPoint,
              point,
              currentStroke
            );

            // 逐个处理插值点
            for (const interpPoint of interpolatedPoints) {
              const interpResult = findClosestPointOnPath(
                interpPoint,
                currentStroke
              );

              if (interpResult.distance <= attractRadius) {
                const interpProgressDiff =
                  interpResult.progress - maxProgressRef.current;

                if (
                  interpResult.progress >= minRequiredProgress &&
                  interpProgressDiff <= maxAllowedJump
                ) {
                  setCurrentPath((prev) => [
                    ...prev,
                    interpResult.closestPoint,
                  ]);
                  setProgress(interpResult.progress);
                  setMaxProgress((prev) => {
                    const newMaxProgress = Math.max(
                      prev,
                      interpResult.progress
                    );
                    maxProgressRef.current = newMaxProgress;
                    return newMaxProgress;
                  });
                }
              }
            }
          }
        } else if (
          result.progress >= minRequiredProgress &&
          progressDiff <= maxAllowedJump
        ) {
          // 正常情况，直接添加点
          setCurrentPath((prev) => [...prev, result.closestPoint]);
          setProgress(result.progress);
          setMaxProgress((prev) => {
            const newMaxProgress = Math.max(prev, result.progress);
            maxProgressRef.current = newMaxProgress;
            return newMaxProgress;
          });
        }

        // 记录当前触摸点，用于下次插值
        lastTouchPointRef.current = point;
      }
    },
    [
      isDrawing,
      currentStroke,
      strokes,
      getSVGPoint,
      findClosestPointOnPath,
      interpolatePoints,
    ]
  );

  // 结束绘制
  const handleEnd = useCallback(() => {
    // 结束时清空
    lastTouchPointRef.current = null;
    if (!isDrawing || currentStroke >= strokes.length) return;

    const progressThreshold = 0.92;
    const minDrawnLengthRatio = 0.75;

    const stroke = strokes[currentStroke];
    const drawnLength = currentPath.reduce((acc, p, idx) => {
      if (idx === 0) return 0;
      const prev = currentPath[idx - 1];
      return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0);

    const nearEnd = (() => {
      if (!stroke || currentPath.length === 0) return false;
      const last = currentPath[currentPath.length - 1];
      const target = stroke.isClosed ? stroke.startPoint : stroke.endPoint;
      const dist = Math.hypot(last.x - target.x, last.y - target.y);
      if (letter === "b") return dist < 75;
      return dist < 30;
    })();
    if (
      maxProgressRef.current >= progressThreshold &&
      nearEnd &&
      drawnLength >= stroke.length * minDrawnLengthRatio
    ) {
      // 使用原始路径作为已完成的笔画，避免与轮廓不一致
      setUserPaths((prev) => [...prev, { d: stroke.path }]);
      setCurrentStroke((prev) => prev + 1);
    }

    setIsDrawing(false);
    setCurrentPath([]);
    setProgress(0);
    setMaxProgress(0);
    maxProgressRef.current = 0;
  }, [isDrawing, currentStroke, strokes, currentPath, letter]);

  return (
    <>
      <div
        className={classNames("svg-container", {
          top25: ["f"].includes(letter),
          bottom0: ["g", "y"].includes(letter),
          bottom20: ["j", "p", "q"].includes(letter),
        })}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      >
        <svg
          ref={svgRef}
          width={svgSize.width}
          height={svgSize.height}
          viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
          style={{
            width: `${svgSize.width}`,
            height: `${svgSize.height}`,
          }}
        >
          {/* 背景参考 */}
          <g stroke="#CBC9D9" strokeWidth={strokeWidth} fill="none">
            {strokes.map((s) => (
              <path
                key={s.id}
                d={s.path}
                strokeLinecap={"round"}
                strokeLinejoin="round"
              />
            ))}
          </g>

          {/* 已完成的笔画 */}
          {userPaths.map((p) => (
            <path
              key={p.d}
              d={p.d}
              stroke="#2E2866"
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* 当前笔画引导线（会被进度覆盖） */}
          {currentStroke < strokes.length && strokes[currentStroke] && (
            <g>
              {strokes[currentStroke].isDot ? (
                // 点击式的点
                <circle
                  cx={strokes[currentStroke].startPoint.x}
                  cy={strokes[currentStroke].startPoint.y}
                  r="6"
                  fill="#b370ff"
                  stroke="white"
                  strokeWidth="1"
                />
              ) : (
                // 普通笔画：显示路径、起点和箭头
                <>
                  <path
                    d={strokes[currentStroke].path}
                    stroke="#b370ff"
                    strokeWidth="1"
                    fill="none"
                    strokeLinecap={
                      strokes[currentStroke].isClosed ? undefined : "round"
                    }
                    strokeLinejoin="round"
                  />

                  <circle
                    cx={strokes[currentStroke].startPoint.x}
                    cy={strokes[currentStroke].startPoint.y}
                    r="6"
                    fill="#b370ff"
                    stroke="white"
                    strokeWidth="1"
                  />

                  {strokes[currentStroke].points &&
                    strokes[currentStroke].points.length > 10 && (
                      <g>{renderArrows(strokes[currentStroke])}</g>
                    )}
                </>
              )}
            </g>
          )}

          {/* 当前绘制的路径（使用原始路径按进度填充，覆盖当前笔画引导线） */}
          {currentStroke < strokes.length && maxProgress > 0 && (
            <path
              d={strokes[currentStroke].path}
              stroke="#2E2866"
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap={
                strokes[currentStroke].isClosed ? undefined : "round"
              }
              strokeLinejoin="round"
              pathLength={1}
              // 使用一个非常大的间隙，避免 dash 模式重复导致尾部也出现填充
              strokeDasharray={`${Math.max(0, Math.min(1, maxProgress))} 10000`}
              strokeDashoffset={0}
            />
          )}
        </svg>
      </div>
    </>
  );
};

export default SVGLetterTracing;
