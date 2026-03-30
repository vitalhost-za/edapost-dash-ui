module.exports = {
  apps: [
    {
      name: "edapost-api",
      script: "api.js",
      cwd: "/opt/edapost/server",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "300M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/edapost/api-error.log",
      out_file: "/var/log/edapost/api-out.log",
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "edapost-worker",
      script: "worker.js",
      cwd: "/opt/edapost/server",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/edapost/worker-error.log",
      out_file: "/var/log/edapost/worker-out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
