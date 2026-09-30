// 旅界 桌面启动器（壳）
//
// 真正的 Electron 主程序在本目录下叫 AgentWorlds-core.exe。
// 本壳存在的原因：部分受限/远程会话里 Chromium 沙箱无法初始化，进程会在加载任何应用代码
// 之前就静默退出（表现就是“双击 exe 没反应”，日志/窗口全无）。那种情况下只能靠命令行
// 追加 --no-sandbox，而应用自身来不及做任何事。
//
// 行为：
//   1) 按用户给的参数正常启动 core；
//   2) 若 4 秒内就退出（沙箱不可用的典型特征），自动带上 --no-sandbox 重试一次；
//   3) 正常运行时把子进程的 stdout/stderr 与退出码原样转发，行为与直接跑原 exe 一致
//      （冒烟测试依赖这一点）。
// 用户已经显式传了 --no-sandbox 时不再做二次尝试。
//
// 编译（.NET Framework 自带编译器即可）：
//   csc.exe /target:winexe /optimize+ /out:runtime\AgentWorlds.exe tools\launcher\AgentWorldsLauncher.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

internal static class Launcher
{
    private const int FastExitMs = 4000;

    private static int Main(string[] args)
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string core = Path.Combine(dir, "AgentWorlds-core.exe");
        if (!File.Exists(core))
        {
            Say("[x] AgentWorlds-core.exe not found next to this launcher." + Environment.NewLine);
            return 1;
        }

        bool hasNoSandbox = false;
        for (int i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], "--no-sandbox", StringComparison.OrdinalIgnoreCase)) hasNoSandbox = true;
        }
        if (hasNoSandbox) return Run(core, dir, args);

        Process first = Start(core, dir, args, false);
        if (first == null) return 1;

        if (first.WaitForExit(FastExitMs))
        {
            int code = SafeExitCode(first);
            Say("[i] normal launch failed (exit " + code + "), retrying with --no-sandbox ..." + Environment.NewLine);
            string[] retry = new string[args.Length + 1];
            Array.Copy(args, retry, args.Length);
            retry[args.Length] = "--no-sandbox";
            return Run(core, dir, retry);
        }

        // 已经跑起来了：继续转发输出与退出码，别把它当失败处理
        return Pump(first);
    }

    private static int Run(string core, string dir, string[] args)
    {
        Process p = Start(core, dir, args, true);
        if (p == null) return 1;
        return Pump(p);
    }

    private static Process Start(string core, string dir, string[] args, bool quiet)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = core;
            psi.WorkingDirectory = dir;
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            for (int i = 0; i < args.Length; i++) psi.Arguments += Quote(args[i]) + " ";
            Process p = new Process();
            p.StartInfo = psi;
            p.Start();
            return p;
        }
        catch (Exception e)
        {
            if (!quiet) Say("[x] failed to start AgentWorlds-core.exe: " + e.Message + Environment.NewLine);
            return null;
        }
    }

    private static string Quote(string a)
    {
        if (a == null) return "\"\"";
        if (a.Length > 0 && a.IndexOf(' ') < 0 && a.IndexOf('"') < 0 && a.IndexOf('\t') < 0) return a;
        return "\"" + a.Replace("\\\"", "\\\\\"").Replace("\"", "\\\"") + "\"";
    }

    private static int Pump(Process p)
    {
        Thread to = new Thread(delegate() { Copy(p.StandardOutput, false); });
        Thread te = new Thread(delegate() { Copy(p.StandardError, true); });
        to.IsBackground = true;
        te.IsBackground = true;
        try { to.Start(); te.Start(); } catch (Exception) { /* ignore */ }
        try { p.WaitForExit(); } catch (Exception) { /* ignore */ }
        try { to.Join(1000); te.Join(1000); } catch (Exception) { /* ignore */ }
        return SafeExitCode(p);
    }

    private static void Copy(StreamReader reader, bool toErr)
    {
        try
        {
            char[] buf = new char[2048];
            int n;
            while ((n = reader.Read(buf, 0, buf.Length)) > 0)
            {
                string s = new string(buf, 0, n);
                if (toErr) { Console.Error.Write(s); Console.Error.Flush(); }
                else { Console.Out.Write(s); Console.Out.Flush(); }
            }
        }
        catch (Exception) { /* 管道关闭等，忽略 */ }
    }

    private static int SafeExitCode(Process p)
    {
        try { return p.ExitCode; } catch (Exception) { return 0; }
    }

    private static void Say(string s)
    {
        try { Console.Out.Write(s); Console.Out.Flush(); } catch (Exception) { /* 无控制台时忽略 */ }
    }
}
