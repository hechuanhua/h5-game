import { FC } from "react";
import { SVGLetterTracing } from "./SVGLetterTracing";
import "./style.less";

/**
 * 15. 字母书写
 * @param param0
 * @returns
 */
export const LetterTracing: FC<{ letter: string }> = ({ letter }) => {
  return (
    <div className="svg-letter-tracing">
      <SVGLetterTracing letter={letter.toLocaleUpperCase()} />
      <SVGLetterTracing letter={letter.toLocaleLowerCase()} />
    </div>
  );
};

export default LetterTracing;
