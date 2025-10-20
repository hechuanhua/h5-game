export interface Point {
  x: number;
  y: number;
}

export interface StrokeInfo {
  id: number;
  path: string;
  startPoint: Point;
  endPoint: Point;
  isClosed: boolean;
  points: Point[];
  length: number;
  isCircular: boolean;
  isDot?: boolean; // 标识是否为点击式的点
}

/**
 * 解析SVG文件内容，提取所有路径信息和尺寸
 * @param svgContent SVG文件的字符串内容
 * @param letterName 字母名称（用于生成笔画名称）
 * @returns 解析后的笔画信息数组和SVG尺寸
 */
export function parseSVGPaths(
  svgContent: string,
  letterName: string
): {
  strokes: Omit<StrokeInfo, "points" | "length">[];
  dimensions: { width: number; height: number };
} {
  // 创建临时DOM解析器
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

  // 检查解析错误
  const parseError = svgDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`SVG解析失败: ${parseError.textContent}`);
  }

  const svgElement = svgDoc.querySelector("svg");
  if (!svgElement) {
    throw new Error("SVG文件中未找到svg元素");
  }

  // 获取width和height属性
  const widthAttr = svgElement.getAttribute("width");
  const heightAttr = svgElement.getAttribute("height");

  const width = widthAttr
    ? parseFloat(widthAttr.replace(/[^\d.]/g, "")) || 250
    : 250;
  const height = heightAttr
    ? parseFloat(heightAttr.replace(/[^\d.]/g, "")) || 250
    : 250;

  // 获取所有path元素和circle元素
  const pathElements = Array.from(svgDoc.querySelectorAll("path"));
  const circleElements = Array.from(
    svgDoc.querySelectorAll('circle[data-stroke-type="dot"]')
  );

  if (pathElements.length === 0 && circleElements.length === 0) {
    throw new Error(`SVG文件中未找到${letterName}的path或circle元素`);
  }

  const strokes: Omit<StrokeInfo, "points" | "length">[] = [];
  let strokeIdCounter = 1;

  // 处理circle元素（点击式的点）
  circleElements.forEach((circleElement) => {
    const cx = parseFloat(circleElement.getAttribute("cx") || "0");
    const cy = parseFloat(circleElement.getAttribute("cy") || "0");

    // 为点创建一个虚拟的路径（实际上不会被追踪）
    const dotPath = `M${cx},${cy}L${cx},${cy}`;

    strokes.push({
      id: strokeIdCounter++,
      path: dotPath,
      startPoint: { x: cx, y: cy },
      endPoint: { x: cx, y: cy },
      isClosed: false,
      isCircular: false,
      isDot: true,
    });
  });

  // 逐个 path 处理；若单个 d 内有两个 M，则尝试在内部合并
  pathElements.forEach((pathElement, index) => {
    const rawPathData = pathElement.getAttribute("d");
    if (!rawPathData) {
      console.warn(`第${index + 1}个path元素缺少'd'属性，跳过`);
      return;
    }

    // 在这里尝试将包含两个子路径(M)的路径合并为一个
    let pathData = maybeMergeTwoSubpaths(rawPathData);

    // 根据字母类型和笔画索引应用前进起点配置
    // 注意：这里的strokeId应该基于当前的strokeIdCounter，而不是path的index
    const currentStrokeId = strokeIdCounter;
    if (letterName === "d" && currentStrokeId === 1) {
      // d字母第一个笔画前进89%
      pathData = resamplePathWithCustomStart(pathData, 0.89);
    } else if (letterName === "p" && currentStrokeId === 2) {
      // p字母第二个笔画前进84%
      pathData = resamplePathWithCustomStart(pathData, 0.84);
    }

    // 解析起点和终点
    const { startPoint, endPoint, isClosed } = parsePathPoints(pathData);

    // 判断路径是否包含圆形特征
    const isCircular = hasCircularFeatures(pathData);

    strokes.push({
      id: strokeIdCounter++,
      path: pathData,
      startPoint,
      endPoint,
      isClosed,
      isCircular,
    });
  });

  return {
    strokes,
    dimensions: { width, height },
  };
}

/**
 * 解析路径字符串，提取起点、终点和是否闭合
 */
function parsePathPoints(pathData: string): {
  startPoint: Point;
  endPoint: Point;
  isClosed: boolean;
} {
  // 简化的路径解析，提取M命令的起点
  const moveToMatch = pathData.match(/[Mm]\s*([\d.-]+)[\s,]+([\d.-]+)/);

  if (!moveToMatch) {
    throw new Error(`无法解析路径起点: ${pathData}`);
  }

  const startPoint: Point = {
    x: Number(parseFloat(moveToMatch[1]).toFixed(2)),
    y: Number(parseFloat(moveToMatch[2]).toFixed(2)),
  };

  // 检查是否为闭合路径
  const isClosed = /[Zz]\s*$/.test(pathData.trim());

  let endPoint: Point;

  if (isClosed) {
    // 闭合路径，终点就是起点
    endPoint = { ...startPoint };
  } else {
    // 开放路径，需要计算最后一个点
    // 这里使用临时SVG元素来获取路径的最后一点
    endPoint = getPathEndPoint(pathData) || startPoint;
  }

  return { startPoint, endPoint, isClosed };
}

/**
 * 获取路径的终点坐标（用于开放路径）
 */
// 判断是否在浏览器环境（有 DOM）
function hasDOM(): boolean {
  return typeof document !== "undefined" && !!document.createElementNS;
}
function getPathEndPoint(pathData: string): Point | null {
  try {
    if (!hasDOM()) return null;
    // 创建临时SVG元素
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    document.body.appendChild(svg);

    const totalLength = path.getTotalLength();
    const endPoint = path.getPointAtLength(totalLength);

    // 清理临时元素
    document.body.removeChild(svg);
    return {
      x: Number(endPoint.x.toFixed(2)),
      y: Number(endPoint.y.toFixed(2)),
    };
  } catch (error) {
    console.warn("获取路径终点失败:", error);
    return null;
  }
}

/**
 * 从SVG文件URL加载并解析路径
 * @param svgUrl SVG文件的URL路径
 * @param letterName 字母名称
 * @returns Promise<StrokeInfo[]> 解析后的笔画信息
 */
export async function loadSVGStrokes(
  svgUrl: string,
  letterName: string
): Promise<Omit<StrokeInfo, "points" | "length">[]> {
  try {
    const response = await fetch(svgUrl);
    if (!response.ok) {
      throw new Error(
        `加载SVG文件失败: ${response.status} ${response.statusText}`
      );
    }

    const svgContent = await response.text();
    const result = parseSVGPaths(svgContent, letterName);
    return result.strokes;
  } catch (error) {
    console.error("加载SVG文件时出错:", error);
    throw error;
  }
}

/**
 * 批量加载多个字母的SVG文件
 * @param letters 字母列表，如 ['a', 'b', 'c', ...]
 * @param svgBasePath SVG文件的基础路径，如 '/src/assets/'
 * @returns Promise<Record<string, StrokeInfo[]>> 字母到笔画信息的映射
 */
export async function loadAllLetterSVGs(
  letters: string[],
  svgBasePath = "/src/assets/"
): Promise<Record<string, Omit<StrokeInfo, "points" | "length">[]>> {
  const letterStrokes: Record<string, Omit<StrokeInfo, "points" | "length">[]> =
    {};

  // 并行加载所有SVG文件
  const loadPromises = letters.map(async (letter) => {
    try {
      const svgUrl = `${svgBasePath}${letter}.svg`;
      const strokes = await loadSVGStrokes(svgUrl, letter);
      letterStrokes[letter] = strokes;
    } catch (error: any) {
      console.warn(`跳过字母 ${letter}: ${error}`);
      // 如果某个字母加载失败，不影响其他字母
    }
  });

  await Promise.all(loadPromises);
  return letterStrokes;
}

/**
 * 路径修改配置接口
 */
export interface PathModificationConfig {
  /** 自定义起点（在原路径上的位置百分比 0-1） */
  customStartRatio?: number;
  /** 是否逆转路径方向 */
  reverse?: boolean;
}

/**
 * 通用路径采样函数
 * @param pathData SVG路径数据
 * @param numPoints 采样点数量
 * @param sampleFunction 自定义采样函数，接收(index, numPoints, totalLength)参数，返回采样距离
 * @returns 采样得到的点数组
 */
export function samplePathPoints(
  pathData: string,
  numPoints: number,
  sampleFunction: (
    index: number,
    numPoints: number,
    totalLength: number
  ) => number
): Point[] {
  if (!hasDOM()) return [];

  // 创建临时SVG元素
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
  document.body.appendChild(svg);

  try {
    const totalLength = path.getTotalLength();
    const points: Point[] = [];

    // 使用自定义采样函数进行采样
    for (let i = 0; i <= numPoints; i++) {
      const distance = sampleFunction(i, numPoints, totalLength);
      const point = path.getPointAtLength(distance);
      points.push({
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2)),
      });
    }

    return points;
  } finally {
    // 清理临时元素
    document.body.removeChild(svg);
  }
}

/**
 * 将点数组转换为SVG路径字符串
 * @param points 点数组
 * @returns SVG路径字符串
 */
export function pointsToPathString(points: Point[]): string {
  if (points.length === 0) return "";

  let pathString = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathString += `L${points[i].x},${points[i].y}`;
  }

  return pathString;
}

/**
 * 将路径按照指定位置重新采样，改变起点位置
 * @param pathData 原始SVG路径数据
 * @param startRatio 新起点在原路径上的位置（0-1）
 * @param numPoints 采样点数量
 * @returns 重新构建的路径数据
 */
export function resamplePathWithCustomStart(
  pathData: string,
  startRatio: number,
  numPoints = 200
): string {
  if (startRatio < 0 || startRatio > 1) {
    throw new Error("startRatio 必须在 0-1 之间");
  }

  try {
    // 使用通用采样函数，从指定起点开始采样
    const points = samplePathPoints(
      pathData,
      numPoints,
      (i, numPoints, totalLength) => {
        const ratio = i / numPoints;
        return ((startRatio + ratio) % 1) * totalLength;
      }
    );

    // 构建新的路径字符串
    if (points.length === 0) return pathData;
    return pointsToPathString(points);
  } catch (error) {
    console.warn("重新采样路径失败:", error);
    return pathData;
  }
}

/**
 * 检测路径是否包含圆形或弧形特征
 * 通过检查路径中是否有重复的坐标点来判断
 * @param pathData 合并后的路径字符串
 * @returns 是否包含圆形特征
 */
export function hasCircularFeatures(pathData: string): boolean {
  try {
    const numSamples = 120; // 增加采样点数量以提高精度

    // 使用通用采样函数，按顺序采样并降低精度以便比较
    const points = samplePathPoints(
      pathData,
      numSamples,
      (i, numSamples, totalLength) => {
        return (i / numSamples) * totalLength;
      }
    ).map((point) => ({
      x: Number(point.x.toFixed(1)), // 降低精度以便比较
      y: Number(point.y.toFixed(1)),
    }));

    // 检查是否有重复的坐标点（间隔至少50个点以上才算符合预期）
    const tolerance = 2; // 降低容差值，提高精度
    let duplicateCount = 0;
    const minGap = 65; // 最小间隔点数，避免相邻弧形被误判

    for (let i = 0; i < points.length - minGap; i++) {
      for (let j = i + minGap; j < points.length; j++) {
        const dx = Math.abs(points[i].x - points[j].x);
        const dy = Math.abs(points[i].y - points[j].y);

        if (dx <= tolerance && dy <= tolerance) {
          duplicateCount++;
          if (duplicateCount >= 3) {
            // 需要至少3个重复点才认为包含圆形特征
            return true;
          }
        }
      }
    }

    return false;
  } catch (error) {
    console.warn("检测圆形特征失败:", error);
    return false;
  }
}

/**
 * 如果一个路径只包含两个子路径(M/m)，尝试将其合并为一个开放路径：
 * - 移除第一个子路径结尾的Z/z（避免提前闭合）
 * - 在两段之间添加一段直线连接到第二段的起点（如果两点已重合则不添加，以去掉交叉点）
 * - 移除第二段末尾的Z/z（保持整体为开放路径，利于描摹效果）
 */
function maybeMergeTwoSubpaths(pathData: string): string {
  try {
    const parts = pathData.match(/[Mm][^Mm]*/g);
    if (!parts || parts.length !== 2) return pathData;

    const part1Raw = parts[0].trim();
    const part2Raw = parts[1].trim();

    // 打开第一段（去掉收尾Z）
    const part1Open = part1Raw.replace(/[Zz]\s*$/, "").trim();

    // 解析第二段的M坐标与后续命令
    const mMatch = part2Raw.match(
      /^[Mm]\s*([-,\d.]+)[\s,]+([-,\d.]+)([\s\S]*)$/
    );
    if (!mMatch) return pathData;

    const mIsLowercase = /^[m]/.test(part2Raw);

    // 计算第一段的结束点（用于处理相对m）
    const end1 = getPathEndPoint(part1Open);

    const dx = Number(parseFloat(mMatch[1]).toFixed(2));
    const dy = Number(parseFloat(mMatch[2]).toFixed(2));

    // 对于小写 m（相对移动），需要将起点转换为绝对坐标
    const x2 = mIsLowercase && end1 ? Number((end1.x + dx).toFixed(2)) : dx;
    const y2 = mIsLowercase && end1 ? Number((end1.y + dy).toFixed(2)) : dy;

    let rest2 = (mMatch[3] || "").trim();
    // 移除第二段末尾Z，保持为开放路径
    rest2 = rest2.replace(/[Zz]\s*$/, "").trim();

    const eps = 0.01;
    const needConnector =
      !end1 || Math.abs(end1.x - x2) > eps || Math.abs(end1.y - y2) > eps;

    let combined = part1Open;
    if (needConnector) {
      combined += ` L${x2},${y2}`; // 连接线段
    }

    if (rest2) {
      combined += (combined.endsWith(" ") ? "" : " ") + rest2; // 接上第二段后续命令
    }

    return combined;
  } catch (e) {
    console.warn("合并两个子路径失败，使用原始路径:", e);
    return pathData;
  }
}
