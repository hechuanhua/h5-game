import React from "react";
import pawYellow from "@/assets/images/paw-yellow.svg?url";
import pawWhite from "@/assets/images/paw-white.svg?url";

import "./style.less";

interface PawStepsProps {
  steps: number;
  maxSteps?: number;
}

const PawSteps: React.FC<PawStepsProps> = ({ steps, maxSteps = 6 }) => {
  const renderPaws = () => {
    const paws = [];
    const actualSteps = Math.min(Math.max(steps, 0), maxSteps);

    for (let i = 0; i < maxSteps; i++) {
      const isActive = i < actualSteps;
      const pawSrc = isActive ? pawYellow : pawWhite;

      paws.push(<img key={i} src={pawSrc} alt="" className="paw-step" />);
    }

    return paws;
  };

  return <div className="paw-steps">{renderPaws()}</div>;
};

export default PawSteps;
