import React from "react"
import { PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LogoCloudProps = React.ComponentProps<"div">;

const techStack = [
  { name: "Node.js", abbr: "Node" },
  { name: "TypeScript", abbr: "TS" },
  { name: "Prisma", abbr: "Prisma" },
  { name: "P-256 ECDSA", abbr: "P-256" },
  { name: "Redis", abbr: "Redis" },
  { name: "PostgreSQL", abbr: "PG" },
  { name: "Web Crypto", abbr: "WCrypto" },
  { name: "Docker", abbr: "Docker" },
];

export function LogoCloud({ className, ...props }: LogoCloudProps) {
  return (
    <div
      className={cn(
        "relative grid grid-cols-2 border-x border-zinc-700/30 md:grid-cols-4",
        className
      )}
      {...props}
    >
      <div className="-translate-x-1/2 -top-px pointer-events-none absolute left-1/2 w-screen border-t border-zinc-700/30" />

      {techStack.map((tech, index) => (
        <div
          key={tech.name}
          className={cn(
            "flex items-center justify-center bg-zinc-900 px-4 py-8 md:p-8 relative",
            index % 4 < 3 && "md:border-r border-zinc-700/30",
            index < techStack.length - 2 && "border-b border-zinc-700/30",
            index === 0 && "relative"
          )}
        >
          <span className="text-sm md:text-base font-medium text-zinc-500 tracking-wide select-none">
            {tech.name}
          </span>
          {index === 0 && (
            <PlusIcon
              className="-right-[12.5px] -bottom-[12.5px] absolute z-10 size-6 text-zinc-700/30"
              strokeWidth={1}
            />
          )}
          {index === 2 && (
            <>
              <PlusIcon
                className="-right-[12.5px] -bottom-[12.5px] absolute z-10 size-6 text-zinc-700/30"
                strokeWidth={1}
              />
              <PlusIcon
                className="-bottom-[12.5px] -left-[12.5px] absolute z-10 hidden size-6 md:block text-zinc-700/30"
                strokeWidth={1}
              />
            </>
          )}
        </div>
      ))}

      <div className="-translate-x-1/2 -bottom-px pointer-events-none absolute left-1/2 w-screen border-b border-zinc-700/30" />
    </div>
  );
}
