using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace XiaoHuTodo
{
    public class MainForm : Form
    {
        private WebView2 webView;

        public MainForm()
        {
            this.Text = "小胡同学To-do List";
            this.Width = 1200;
            this.Height = 900;
            this.MinimumSize = new System.Drawing.Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;

            webView = new WebView2
            {
                Dock = DockStyle.Fill
            };

            this.Controls.Add(webView);
            InitializeAsync();
        }

        async void InitializeAsync()
        {
            try
            {
                await webView.EnsureCoreWebView2Async(null);
                
                string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "index.html");
                
                if (File.Exists(htmlPath))
                {
                    webView.CoreWebView2.Navigate("file:///" + htmlPath.Replace("\\", "/"));
                }
                else
                {
                    MessageBox.Show("找不到 index.html 文件！", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"初始化失败：{ex.Message}\n\n请确保已安装 WebView2 Runtime。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
