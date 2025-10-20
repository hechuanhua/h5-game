import toast from 'react-hot-toast';

// 游戏配置接口
interface LinkGameConfig {
  cellHeight?: number;
  cols?: number;
  rows?: number;
  initialTime?: number;
}

// 格子信息接口
export interface CellInfo {
  isEmpty: boolean;
  type: number;
  pic: string;
  index?: number;
}

// 点击信息接口
interface ClickInfo {
  row: number;
  col: number;
  index: number;
}

// 坐标点接口
type Point = [number, number];

// 游戏结束类型  1正常消完 2步数超过 3时间超过
export type GameOverType1 = 1 | 2 | 3;
export enum GameOverType {
  Normal = 1,
  StepsExceeded = 2,
  TimeExceeded = 3,
}

// 游戏状态类型
interface CharacterInfo {
  type: number;
  pic: string;
  index: number;
}

// 回调函数类型定义
type ScoreUpdateCallback = (score: number) => void;
type TimeUpdateCallback = (time: number) => void;

type SelectedCellChangeCallback = (cellInfo: ClickInfo | null) => void;
type GameOverCallback = (type: GameOverType, score: number) => void;
type MapUpdateCallback = (pictures: CellInfo[][], rows: number, cols: number) => void;
type DrawLineCallback = (points: Point[], onSuccess: () => void, onError?: () => void) => void;
type AnimationStartCallback = (cells: { row: number; col: number }[]) => void;
type ShakeEffectCallback = (cells: { row: number; col: number; letter: string }[]) => void;
type StepUpdateCallback = (steps: number) => void;
type TargetLetterEliminatedCallback = () => void;
type HintCallback = (cells: { row: number; col: number; letter: string }[]) => void;

class LinkGameEngine {
  private score = 0; // 得分
  private steps = 0; // 步数
  private cols: number; // 列数
  private rows: number; // 行数
  private configInitialTime: number; // 配置的初始时间
  private leftDisorderTime = 5; // 剩余重排次数
  private autoDisorderEnabled = true; // 是否启用自动重排

  // 游戏状态管理
  private isAnimating = false; // 是否正在播放动画
  private selectedCell: ClickInfo | null = null; // 当前选中的格子

  // 游戏数据
  private count = 0; // 字母的总数
  private remain = 0; // 剩余的未有消去的字母
  private pictures: CellInfo[][] = []; // 字母集合
  private preClickInfo: ClickInfo | null = null; // 上一次被点中的字母信息
  private leftTime = 0; // 剩余时间
  private points: Point[] = []; // 字母可以相消时的拐点集合
  private timer: number | null = null; // 定时器
  private targetLetter = 'A'; // 目标字母

  // 回调函数
  onScoreUpdate: ScoreUpdateCallback | null = null;
  onTimeUpdate: TimeUpdateCallback | null = null;

  onSelectedCellChange: SelectedCellChangeCallback | null = null; // 选中格子变化回调
  onGameOver: GameOverCallback | null = null;
  onMapUpdate: MapUpdateCallback | null = null;
  onDrawLine: DrawLineCallback | null = null;
  onAnimationStart: AnimationStartCallback | null = null;
  onShakeEffect: ShakeEffectCallback | null = null;
  onStepUpdate: StepUpdateCallback | null = null;
  onTargetLetterEliminated: TargetLetterEliminatedCallback | null = null;
  onHint: HintCallback | null = null;

  constructor(config: LinkGameConfig) {
    this.cols = config.cols || 10;
    this.rows = config.rows || 8;
    this.configInitialTime = config.initialTime || 1000;
  }

  // 设置目标字母
  setTargetLetter(letter: string): void {
    this.targetLetter = letter.toUpperCase();
  }

  // 获取目标字母
  getTargetLetter(): string {
    return this.targetLetter;
  }

  init(_isReset?: boolean): void {
    this.count = (this.rows - 2) * (this.cols - 2); // 字母的总数
    // remain将在createMap后根据实际生成的字母数量设置
    this.remain = 0; // 剩余的未有消去的字母
    this.pictures = []; // 字母集合
    this.preClickInfo = null; // 上一次被点中的字母信息
    this.leftTime = this.configInitialTime; // 剩余时间
    this.points = []; // 字母可以相消时的拐点集合

    // 重置游戏状态
    this.isAnimating = false; // 重置动画状态
    this.setSelectedCell(null);

    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.updateCountDown();
    }, 1000);

    this.createMap();
    this.disorder();

    // 根据实际生成的字母数量设置remain
    this.remain = this.getActualLetterCount();

    this.updateScore();
  }

  reset(): void {
    this.init(true);
  }

  private updateCountDown(): void {
    this.leftTime--;
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.leftTime);
    }
    // console.log(this.leftTime, this.remain, this.steps, 'this.leftTime');
    if (this.leftTime <= 0) {
      this.gameOver(GameOverType.TimeExceeded);
    }
  }

  private gameOver(type: GameOverType): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    if (this.onGameOver) {
      this.onGameOver(type, this.score);
    }
  }

  private setSelectedCell(cellInfo: ClickInfo | null): void {
    this.selectedCell = cellInfo;
    if (this.onSelectedCellChange) {
      this.onSelectedCellChange(cellInfo);
    }
  }

  getSelectedCell(): ClickInfo | null {
    return this.selectedCell;
  }

  getPictures(): CellInfo[][] {
    return this.pictures;
  }

  startGame(): void {
    this.init();
  }

  restartGame(): void {
    this.score = 0;
    this.steps = 0;
    this.leftDisorderTime = 5;
    this.setSelectedCell(null);
    this.reset();

    // 通知外部组件状态变化
    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.score);
    }
    if (this.onStepUpdate) {
      this.onStepUpdate(this.steps);
    }
  }

  // 绘制连线逻辑
  private drawLine(points: Point[], onSuccess: () => void, onError?: () => void): void {
    // 清除选中状态
    this.setSelectedCell(null);

    if (this.onDrawLine) {
      this.onDrawLine(points, onSuccess, onError);
    } else {
      onSuccess();
    }
  }

  // 重排功能
  handleDisorder(): boolean {
    if (this.leftDisorderTime > 0) {
      this.leftDisorderTime--;
      this.disorder();
      return true;
    }
    return false;
  }

  // 获取重排次数
  getLeftDisorderTime(): number {
    return this.leftDisorderTime;
  }

  private updateScore(): void {
    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.score);
    }
  }

  private updateSteps(): void {
    this.steps++;
    if (this.onStepUpdate) {
      this.onStepUpdate(this.steps);
    }

    // 每一步都检查死锁状态
    if (this.checkCurrentDeadlock()) {
      if (!this.autoDisorder()) {
        // 如果自动重排失败，提示玩家手动重排
        console.warn('游戏陷入死锁，请使用重排功能');
      }
    }

    // 第5步时给出提示
    if (this.steps === 5 && this.remain > 0) {
      this.showHint();
    }

    // 检查步数限制，达到6步时游戏结束
    if (this.steps >= 6) {
      if (this.remain > 0) {
        this.gameOver(GameOverType.StepsExceeded);
      } else {
        this.gameOver(GameOverType.Normal);
      }
    }
  }

  getSteps(): number {
    return this.steps;
  }

  private getActualLetterCount(): number {
    let count = 0;
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty) {
          count++;
        }
      }
    }
    return count;
  }

  private createMap(): void {
    let attempts = 0;
    const maxAttempts = 100;

    do {
      this.generateRandomMap();
      attempts++;
    } while (!this.isSolvable() && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      console.warn('无法生成可解的地图，使用当前地图');
    }
  }

  private generateRandomMap(): void {
    let attempts = 0;
    const maxAttempts = 30;

    do {
      this.initializeEmptyMap();

      if (attempts < 15) {
        // 前15次尝试：使用边缘优先策略
        this.generateMapWithEdgePriority();
      } else {
        // 后15次尝试：使用传统随机生成
        this.generateMapTraditional();
      }

      attempts++;
    } while (!this.isSolvable() && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      console.warn('智能地图生成失败，使用保证可解的模板');
      this.generateSolvableTemplate();
    }
  }

  // 边缘优先地图生成
  private generateMapWithEdgePriority(): void {
    const letters = this.generateLetterPairs();
    const positions = this.getAllValidPositions();

    // 按边缘优先级排序
    positions.sort((a, b) => this.getEdgeScore(b.row, b.col) - this.getEdgeScore(a.row, a.col));

    // 分组字母对
    const letterPairs = LinkGameEngine.groupIntoLetterPairs(letters);

    // 放置字母对
    for (let i = 0; i < letterPairs.length && i * 2 < positions.length; i++) {
      const pair = letterPairs[i];
      this.placeLetter(positions[i * 2], pair[0]);
      this.placeLetter(positions[i * 2 + 1], pair[1]);
    }
  }

  // 传统随机地图生成
  private generateMapTraditional(): void {
    const letters = this.generateLetterPairs();
    letters.sort(() => Math.random() - 0.5);

    let letterIndex = 0;
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (letterIndex < letters.length) {
          this.placeLetter({ row: i, col: j }, letters[letterIndex]);
          letterIndex++;
        }
      }
    }
  }

  // 初始化空地图
  private initializeEmptyMap(): void {
    this.pictures = [];
    for (let i = 0; i < this.rows; i++) {
      this.pictures[i] = [];
      for (let j = 0; j < this.cols; j++) {
        this.pictures[i][j] = {
          isEmpty: true,
          type: 0,
          pic: '',
        };
      }
    }
  }

  // 生成字母对
  private generateLetterPairs(): string[] {
    const letters: string[] = [];
    const totalCells = (this.rows - 2) * (this.cols - 2);
    const pairsNeeded = Math.floor(totalCells / 2);

    // 确保目标字母包含在内
    if (this.targetLetter) {
      letters.push(this.targetLetter.toLowerCase());
      letters.push(this.targetLetter.toUpperCase());
    }

    // 添加其他随机字母
    const allLetters = 'abcdefghijklmnopqrstuvwxyz';
    const usedLetters = new Set(this.targetLetter ? [this.targetLetter.toLowerCase()] : []);

    while (letters.length < pairsNeeded * 2) {
      const randomLetter = allLetters[Math.floor(Math.random() * allLetters.length)];
      if (!usedLetters.has(randomLetter)) {
        letters.push(randomLetter);
        letters.push(randomLetter.toUpperCase());
        usedLetters.add(randomLetter);
      }
    }

    return letters;
  }

  // 获取所有有效位置
  private getAllValidPositions(): Array<{ row: number; col: number }> {
    const positions: Array<{ row: number; col: number }> = [];
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        positions.push({ row: i, col: j });
      }
    }
    return positions;
  }

  // 将字母分组为配对
  private static groupIntoLetterPairs(letters: string[]): string[][] {
    const pairs: string[][] = [];
    const letterMap: { [key: string]: string[] } = {};

    letters.forEach(letter => {
      const key = letter.toLowerCase();
      if (!letterMap[key]) {
        letterMap[key] = [];
      }
      letterMap[key].push(letter);
    });

    Object.values(letterMap).forEach(group => {
      if (group.length === 2) {
        pairs.push(group);
      }
    });

    return pairs;
  }

  // 放置字母到指定位置
  private placeLetter(position: { row: number; col: number }, letter: string): void {
    this.pictures[position.row][position.col] = {
      isEmpty: false,
      type: letter.toUpperCase().charCodeAt(0) - 65, // A=0, B=1, etc.
      pic: letter,
      index: Math.floor(Math.random() * 1000),
    };
  }

  // 生成保证可解的模板
  private generateSolvableTemplate(): void {
    this.initializeEmptyMap();

    const letters = this.generateLetterPairs();
    const letterPairs = LinkGameEngine.groupIntoLetterPairs(letters);

    // 使用简单的行排列，确保可解
    let pairIndex = 0;
    for (let i = 1; i < this.rows - 1 && pairIndex < letterPairs.length; i++) {
      for (let j = 1; j < this.cols - 3 && pairIndex < letterPairs.length; j += 2) {
        const pair = letterPairs[pairIndex];
        this.placeLetter({ row: i, col: j }, pair[0]);
        this.placeLetter({ row: i, col: j + 1 }, pair[1]);
        pairIndex++;
      }
    }
  }

  private isSolvable(): boolean {
    // 创建地图的副本用于测试
    const testMap = this.pictures.map(row => row.map(cell => ({ ...cell })));

    // 获取所有非空格子
    const cells: Array<{ row: number; col: number; pic: string }> = [];
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!testMap[i][j].isEmpty) {
          cells.push({ row: i, col: j, pic: testMap[i][j].pic });
        }
      }
    }

    // 使用回溯算法进行更准确的可解性检测
    return this.backtrackSolve(testMap, cells);
  }

  // 使用回溯算法检测可解性
  private backtrackSolve(
    testMap: CellInfo[][],
    cells: Array<{ row: number; col: number; pic: string }>,
  ): boolean {
    if (cells.length === 0) {
      return true; // 所有格子都已消除，游戏可解
    }

    // 尝试所有可能的匹配对
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const cell1 = cells[i];
        const cell2 = cells[j];

        // 检查是否为匹配的字母对（大写和小写）
        const isMatch =
          cell1.pic.toLowerCase() === cell2.pic.toLowerCase() && cell1.pic !== cell2.pic;

        if (isMatch) {
          // 临时保存原始地图状态
          const originalPictures = this.pictures;
          this.pictures = testMap;

          // 检查是否可以连接
          if (this.canCleanup(cell1.col, cell1.row, cell2.col, cell2.row)) {
            // 保存当前状态
            const cell1Original = { ...testMap[cell1.row][cell1.col] };
            const cell2Original = { ...testMap[cell2.row][cell2.col] };

            // 临时移除这两个格子
            testMap[cell1.row][cell1.col].isEmpty = true;
            testMap[cell2.row][cell2.col].isEmpty = true;

            // 创建新的cells数组（不包含已移除的格子）
            const newCells = cells.filter((_, index) => index !== i && index !== j);

            // 递归检查剩余格子是否可解
            if (this.backtrackSolve(testMap, newCells)) {
              // 恢复原始地图
              this.pictures = originalPictures;
              return true;
            }

            // 回溯：恢复格子状态
            testMap[cell1.row][cell1.col] = cell1Original;
            testMap[cell2.row][cell2.col] = cell2Original;
          }

          // 恢复原始地图
          this.pictures = originalPictures;
        }
      }
    }

    return false; // 没有找到可行的解决方案
  }

  // 检查当前游戏状态是否存在死锁
  private checkCurrentDeadlock(): boolean {
    // 获取所有当前可用的匹配对
    const availablePairs = this.getAvailableMatches();
    return availablePairs.length === 0 && this.remain > 0;
  }

  // 获取当前所有可连接的匹配对
  private getAvailableMatches(): Array<{ cell1: ClickInfo; cell2: ClickInfo }> {
    const matches: Array<{ cell1: ClickInfo; cell2: ClickInfo }> = [];
    const cells: ClickInfo[] = [];

    // 收集所有非空格子
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty) {
          cells.push({
            row: i,
            col: j,
            index: this.pictures[i][j].index || 0,
          });
        }
      }
    }

    // 检查所有可能的匹配对
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const cell1 = cells[i];
        const cell2 = cells[j];

        // 检查是否为匹配的字母对
        const pic1 = this.pictures[cell1.row][cell1.col].pic;
        const pic2 = this.pictures[cell2.row][cell2.col].pic;
        const isMatch = pic1.toLowerCase() === pic2.toLowerCase() && pic1 !== pic2;

        if (isMatch && this.canCleanup(cell1.col, cell1.row, cell2.col, cell2.row)) {
          matches.push({ cell1, cell2 });
        }
      }
    }

    return matches;
  }

  // 显示提示：标识下一个可连接的字母对
  private showHint(): void {
    const availableMatches = this.getAvailableMatches();

    if (availableMatches.length > 0) {
      // 取第一个可连接的匹配对作为提示
      const hintMatch = availableMatches[0];
      const cell1 = hintMatch.cell1;
      const cell2 = hintMatch.cell2;

      const hintCells = [
        {
          row: cell1.row,
          col: cell1.col,
          letter: this.pictures[cell1.row][cell1.col].pic,
        },
        {
          row: cell2.row,
          col: cell2.col,
          letter: this.pictures[cell2.row][cell2.col].pic,
        },
      ];

      // 通过回调函数通知UI层显示提示
      if (this.onHint) {
        this.onHint(hintCells);
      }
    }
  }

  // 清除提示
  private clearHint(): void {
    if (this.onHint) {
      this.onHint([]);
    }
  }

  // 自动重排以解决死锁
  private autoDisorder(): boolean {
    if (!this.autoDisorderEnabled || this.leftDisorderTime <= 0) {
      return false;
    }

    console.error('检测到死锁，自动重排中...');
    toast.error('检测到死锁，自动重排中...');
    this.leftDisorderTime--;
    this.disorder();
    return true;
  }

  private disorder(): void {
    let attempts = 0;
    const maxAttempts = 200; // 增加尝试次数

    do {
      // 使用更智能的重排策略
      if (attempts < 50) {
        // 前50次尝试：使用边缘优先策略
        this.smartDisorderEdgeFirst();
      } else if (attempts < 100) {
        // 51-100次尝试：使用分散策略
        this.smartDisorderSpread();
      } else {
        // 101-200次尝试：使用完全随机策略
        this.randomDisorder();
      }

      attempts++;
    } while (!this.isSolvable() && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      console.warn('无法生成可解的重排，使用当前布局');
      // 最后尝试：强制生成可解布局
      this.forceGenerateSolvableLayout();
    }

    this.renderMap();
  }

  // 边缘优先重排策略
  private smartDisorderEdgeFirst(): void {
    const characters: CharacterInfo[] = [];
    const positions: Array<{ row: number; col: number }> = [];

    // 收集字符和位置
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty) {
          characters.push({
            type: this.pictures[i][j].type,
            pic: this.pictures[i][j].pic,
            index: this.pictures[i][j].index || 0,
          });
          positions.push({ row: i, col: j });
        }
      }
    }

    // 按边缘优先级排序位置（边缘位置更容易连接）
    positions.sort((a, b) => {
      const aEdgeScore = this.getEdgeScore(a.row, a.col);
      const bEdgeScore = this.getEdgeScore(b.row, b.col);
      return bEdgeScore - aEdgeScore;
    });

    // 打乱字符
    characters.sort(() => Math.random() - 0.5);

    // 重新分配
    for (let i = 0; i < positions.length && i < characters.length; i++) {
      const pos = positions[i];
      const char = characters[i];
      this.pictures[pos.row][pos.col].type = char.type;
      this.pictures[pos.row][pos.col].pic = char.pic;
      this.pictures[pos.row][pos.col].index = char.index;
    }
  }

  // 分散策略重排
  private smartDisorderSpread(): void {
    const characters: CharacterInfo[] = [];
    const positions: Array<{ row: number; col: number }> = [];

    // 收集字符和位置
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty) {
          characters.push({
            type: this.pictures[i][j].type,
            pic: this.pictures[i][j].pic,
            index: this.pictures[i][j].index || 0,
          });
          positions.push({ row: i, col: j });
        }
      }
    }

    // 按字母类型分组
    const letterGroups: { [key: string]: CharacterInfo[] } = {};
    characters.forEach(char => {
      const letter = char.pic.toLowerCase();
      if (!letterGroups[letter]) {
        letterGroups[letter] = [];
      }
      letterGroups[letter].push(char);
    });

    // 分散放置相同字母的大小写
    let charIndex = 0;
    Object.values(letterGroups).forEach(group => {
      if (group.length === 2) {
        // 确保大小写字母分散放置
        const pos1 = positions[charIndex % positions.length];
        const pos2 = positions[(charIndex + Math.floor(positions.length / 2)) % positions.length];

        this.pictures[pos1.row][pos1.col].type = group[0].type;
        this.pictures[pos1.row][pos1.col].pic = group[0].pic;
        this.pictures[pos1.row][pos1.col].index = group[0].index;

        this.pictures[pos2.row][pos2.col].type = group[1].type;
        this.pictures[pos2.row][pos2.col].pic = group[1].pic;
        this.pictures[pos2.row][pos2.col].index = group[1].index;

        charIndex += 2;
      }
    });
  }

  // 完全随机重排
  private randomDisorder(): void {
    const characters: CharacterInfo[] = [];
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty) {
          characters.push({
            type: this.pictures[i][j].type,
            pic: this.pictures[i][j].pic,
            index: this.pictures[i][j].index || 0,
          });
        }
      }
    }

    characters.sort(() => Math.random() - 0.5);

    let charIndex = 0;
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty && charIndex < characters.length) {
          this.pictures[i][j].type = characters[charIndex].type;
          this.pictures[i][j].pic = characters[charIndex].pic;
          this.pictures[i][j].index = characters[charIndex].index;
          charIndex++;
        }
      }
    }
  }

  // 获取位置的边缘分数（越靠近边缘分数越高）
  private getEdgeScore(row: number, col: number): number {
    const distanceFromEdge = Math.min(row - 1, this.rows - 2 - row, col - 1, this.cols - 2 - col);
    return 10 - distanceFromEdge;
  }

  // 强制生成可解布局
  private forceGenerateSolvableLayout(): void {
    console.error('强制生成可解布局...');
    toast.error('地图不可解，正在强制生成可解布局...');
    // 重新生成整个地图
    this.generateRandomMap();

    // 如果还是不可解，则使用简单的线性排列
    if (!this.isSolvable()) {
      this.generateLinearLayout();
    }
  }

  // 生成线性排列（保证可解）
  private generateLinearLayout(): void {
    console.error('使用简单的线性排列...');
    const characters: CharacterInfo[] = [];

    // 收集所有字符
    for (let i = 1; i < this.rows - 1; i++) {
      for (let j = 1; j < this.cols - 1; j++) {
        if (!this.pictures[i][j].isEmpty) {
          characters.push({
            type: this.pictures[i][j].type,
            pic: this.pictures[i][j].pic,
            index: this.pictures[i][j].index || 0,
          });
        }
      }
    }

    // 按字母分组并确保配对
    const pairs: CharacterInfo[][] = [];
    const letterMap: { [key: string]: CharacterInfo[] } = {};

    characters.forEach(char => {
      const letter = char.pic.toLowerCase();
      if (!letterMap[letter]) {
        letterMap[letter] = [];
      }
      letterMap[letter].push(char);
    });

    Object.values(letterMap).forEach(group => {
      if (group.length === 2) {
        pairs.push(group);
      }
    });

    // 线性排列配对
    let charIndex = 0;
    for (let i = 1; i < this.rows - 1 && charIndex < pairs.length; i++) {
      for (let j = 1; j < this.cols - 1 && charIndex < pairs.length; j += 2) {
        if (!this.pictures[i][j].isEmpty && !this.pictures[i][j + 1]?.isEmpty) {
          const pair = pairs[charIndex];
          this.pictures[i][j].type = pair[0].type;
          this.pictures[i][j].pic = pair[0].pic;
          this.pictures[i][j].index = pair[0].index;

          if (j + 1 < this.cols - 1) {
            this.pictures[i][j + 1].type = pair[1].type;
            this.pictures[i][j + 1].pic = pair[1].pic;
            this.pictures[i][j + 1].index = pair[1].index;
          }
          charIndex++;
        }
      }
    }
  }

  private renderMap(): void {
    if (this.onMapUpdate) {
      this.onMapUpdate(this.pictures, this.rows, this.cols);
    }
  }

  handleCellClick(row: number, col: number, index: number): void {
    // 游戏进行中才能点击
    if (this.remain <= 0) {
      return;
    }

    // 如果正在播放动画，阻止点击
    if (this.isAnimating) {
      return;
    }

    // 清除提示效果
    this.clearHint();

    const curClickInfo: ClickInfo = { row, col, index };
    this.checkMatch(curClickInfo);
  }

  private checkMatch(curClickInfo: ClickInfo): void {
    const { row, col, index } = curClickInfo;
    const curRow = parseInt(row.toString());
    const curCol = parseInt(col.toString());
    const curIndex = parseInt(index.toString());

    if (this.pictures[curRow][curCol].isEmpty) {
      return;
    }

    // 处理点击同一个格子的情况
    if (this.selectedCell && this.selectedCell.row === row && this.selectedCell.col === col) {
      this.setSelectedCell(null);
      this.preClickInfo = null;
      return;
    }

    if (!this.preClickInfo) {
      // 第一次选择
      this.preClickInfo = { row: curRow, col: curCol, index: curIndex };
      this.setSelectedCell({ row, col, index });
      return;
    }

    const { row: preRow, col: preCol, index: preIndex } = this.preClickInfo;

    // 检查是否为匹配的字母对（大写和小写）
    const preLetter = this.pictures[preRow][preCol].pic;
    const curLetter = this.pictures[curRow][curCol].pic;
    const isMatch = preLetter.toLowerCase() === curLetter.toLowerCase() && preLetter !== curLetter;

    if (isMatch) {
      if (this.canCleanup(preCol, preRow, curCol, curRow)) {
        // 匹配成功且可以连接
        this.score += 100;
        this.remain -= 2;

        // 绘制连线，格子和连线将同步消失
        // 设置动画状态，阻止后续点击
        this.isAnimating = true;

        // 先设置星星动画状态
        if (this.onAnimationStart) {
          this.onAnimationStart([
            { row: preRow, col: preCol },
            { row: curRow, col: curCol },
          ]);
        }

        this.drawLine(
          this.points,
          () => {
            // 成功回调：消除格子，重新渲染地图，检查游戏是否完成
            this.updateStatus(preRow, preCol, curRow, curCol, preIndex, curIndex);
            this.renderMap();
            this.updateScore();
            this.updateSteps();
            // 动画完成，允许后续点击
            this.isAnimating = false;
          },
          () => {},
        );

        // 成功匹配后清空选择
        this.preClickInfo = null;
        this.setSelectedCell(null);
      } else {
        this.isAnimating = true;
        // 匹配但无法连接，只添加shake效果，不播放星星动画
        // 为两个格子添加shake class
        this.addShakeEffect([
          { row: preRow, col: preCol, letter: this.pictures[preRow][preCol].pic },
          { row: curRow, col: curCol, letter: this.pictures[curRow][curCol].pic },
        ]);
        this.drawLine(
          [],
          () => {},
          () => {
            // 匹配但无法连接，清空选择状态，让下次点击成为新的开始
            this.preClickInfo = null;
            this.setSelectedCell(null);
            // 动画完成，允许后续点击
            this.isAnimating = false;
            this.updateSteps();
            this.addShakeEffect([]);
          },
        );
      }
    } else {
      // 字母不匹配，当前点击作为新的第一次选择
      this.preClickInfo = { row: curRow, col: curCol, index: curIndex };
      this.setSelectedCell({ row, col, index });
    }
  }

  private updateStatus(
    preRow: number,
    preCol: number,
    curRow: number,
    curCol: number,
    _preIndex: number,
    _curIndex: number,
  ): void {
    // 检查是否消除了目标字母
    const preLetter = this.pictures[preRow][preCol].pic;
    const curLetter = this.pictures[curRow][curCol].pic;

    if (
      preLetter.toUpperCase() === this.targetLetter ||
      curLetter.toUpperCase() === this.targetLetter
    ) {
      // 目标字母被消除，触发回调
      if (this.onTargetLetterEliminated) {
        this.onTargetLetterEliminated();
      }
    }

    this.pictures[preRow][preCol].isEmpty = true;
    this.pictures[curRow][curCol].isEmpty = true;

    // 检查游戏是否结束
    if (this.remain <= 0) {
      this.gameOver(GameOverType.Normal);
    }
  }

  private isRowEmpty(x1: number, y1: number, x2: number, y2: number): boolean {
    if (y1 !== y2) {
      return false;
    }
    let minX = x1;
    let maxX = x2;
    if (x1 > x2) {
      minX = x2;
      maxX = x1;
    }

    for (let i = minX + 1; i < maxX; ++i) {
      if (!this.pictures[y1][i].isEmpty) {
        return false;
      }
    }
    return true;
  }

  private isColEmpty(x1: number, y1: number, x2: number, y2: number): boolean {
    if (x1 !== x2) {
      return false;
    }
    let minY = y1;
    let maxY = y2;
    if (y1 > y2) {
      minY = y2;
      maxY = y1;
    }

    for (let i = minY + 1; i < maxY; ++i) {
      if (!this.pictures[i][x1].isEmpty) {
        return false;
      }
    }
    return true;
  }

  private addPoints(...args: Point[]): void {
    for (let i = 0; i < args.length; i++) {
      this.points.push(args[i]);
    }
  }

  private canCleanup(x1: number, y1: number, x2: number, y2: number): boolean {
    this.points = [];

    if (x1 === x2) {
      if (Math.abs(y1 - y2) === 1) {
        // 相邻
        this.addPoints([x1, y1], [x2, y2]);
        return true;
      }
      if (this.isColEmpty(x1, y1, x2, y2)) {
        // 直线
        this.addPoints([x1, y1], [x2, y2]);
        return true;
      } // 两个拐点
      let i = 1;
      while (x1 + i < this.cols && this.pictures[y1][x1 + i].isEmpty) {
        if (!this.pictures[y2][x2 + i].isEmpty) {
          break;
        } else {
          if (this.isColEmpty(x1 + i, y1, x1 + i, y2)) {
            this.addPoints([x1, y1], [x1 + i, y1], [x1 + i, y2], [x2, y2]);
            return true;
          }
          i++;
        }
      }
      i = 1;
      while (x1 - i >= 0 && this.pictures[y1][x1 - i].isEmpty) {
        if (!this.pictures[y2][x2 - i].isEmpty) {
          break;
        } else {
          if (this.isColEmpty(x1 - i, y1, x1 - i, y2)) {
            this.addPoints([x1, y1], [x1 - i, y1], [x1 - i, y2], [x2, y2]);
            return true;
          }
          i++;
        }
      }
    }

    if (y1 === y2) {
      // 同行
      if (Math.abs(x1 - x2) === 1) {
        this.addPoints([x1, y1], [x2, y2]);
        return true;
      }
      if (this.isRowEmpty(x1, y1, x2, y2)) {
        this.addPoints([x1, y1], [x2, y2]);
        return true;
      }
      let i = 1;
      while (y1 + i < this.rows && this.pictures[y1 + i][x1].isEmpty) {
        if (!this.pictures[y2 + i][x2].isEmpty) {
          break;
        } else {
          if (this.isRowEmpty(x1, y1 + i, x2, y1 + i)) {
            this.addPoints([x1, y1], [x1, y1 + i], [x2, y1 + i], [x2, y2]);
            return true;
          }
          i++;
        }
      }
      i = 1;
      while (y1 - i >= 0 && this.pictures[y1 - i][x1].isEmpty) {
        if (!this.pictures[y2 - i][x2].isEmpty) {
          break;
        } else {
          if (this.isRowEmpty(x1, y1 - i, x2, y1 - i)) {
            this.addPoints([x1, y1], [x1, y1 - i], [x2, y1 - i], [x2, y2]);
            return true;
          }
          i++;
        }
      }
    }

    // 一个拐点
    if (this.isRowEmpty(x1, y1, x2, y1) && this.pictures[y1][x2].isEmpty) {
      if (this.isColEmpty(x2, y1, x2, y2)) {
        this.addPoints([x1, y1], [x2, y1], [x2, y2]);
        return true;
      }
    }
    if (this.isColEmpty(x1, y1, x1, y2) && this.pictures[y2][x1].isEmpty) {
      if (this.isRowEmpty(x1, y2, x2, y2)) {
        this.addPoints([x1, y1], [x1, y2], [x2, y2]);
        return true;
      }
    }

    // 不在一行的两个拐点
    if (x1 !== x2 && y1 !== y2) {
      let i = x1;
      while (++i < this.cols) {
        if (!this.pictures[y1][i].isEmpty) {
          break;
        } else {
          if (
            this.isColEmpty(i, y1, i, y2) &&
            this.isRowEmpty(i, y2, x2, y2) &&
            this.pictures[y2][i].isEmpty
          ) {
            this.addPoints([x1, y1], [i, y1], [i, y2], [x2, y2]);
            return true;
          }
        }
      }

      i = x1;
      while (--i >= 0) {
        if (!this.pictures[y1][i].isEmpty) {
          break;
        } else {
          if (
            this.isColEmpty(i, y1, i, y2) &&
            this.isRowEmpty(i, y2, x2, y2) &&
            this.pictures[y2][i].isEmpty
          ) {
            this.addPoints([x1, y1], [i, y1], [i, y2], [x2, y2]);
            return true;
          }
        }
      }

      i = y1;
      while (++i < this.rows) {
        if (!this.pictures[i][x1].isEmpty) {
          break;
        } else {
          if (
            this.isRowEmpty(x1, i, x2, i) &&
            this.isColEmpty(x2, i, x2, y2) &&
            this.pictures[i][x2].isEmpty
          ) {
            this.addPoints([x1, y1], [x1, i], [x2, i], [x2, y2]);
            return true;
          }
        }
      }

      i = y1;
      while (--i >= 0) {
        if (!this.pictures[i][x1].isEmpty) {
          break;
        } else {
          if (
            this.isRowEmpty(x1, i, x2, i) &&
            this.isColEmpty(x2, i, x2, y2) &&
            this.pictures[i][x2].isEmpty
          ) {
            this.addPoints([x1, y1], [x1, i], [x2, i], [x2, y2]);
            return true;
          }
        }
      }
    }

    return false;
  }

  private addShakeEffect(cells: { row: number; col: number; letter: string }[]): void {
    // 通知外部组件添加shake效果
    if (this.onShakeEffect) {
      this.onShakeEffect(cells);
    }
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}

export default LinkGameEngine;
