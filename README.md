# YouTube Watch Together

## Overview
YouTube Watch Together is a web application that allows multiple users to watch YouTube videos together in a synchronized manner. It features a shared video queue, user presence, and a dark mode interface.

## Features
*   **Synchronized Playback**: Watch YouTube videos in sync with other users. Play, pause, and seek actions are mirrored across all connected clients.
*   **Shared Video Queue**:
    *   Add YouTube videos to a common queue via URL.
    *   Remove videos from the queue.
    *   Reorder videos within the queue (move up/down).
*   **User Presence**: See who is currently connected to the party. Users can set their own names.
*   **Dark Mode Interface**: A comfortable, modern dark theme for the UI.
*   **Client-Side Volume Control**: Each user controls their own volume independently.

## Prerequisites
*   **Docker**: Docker must be installed on your system. Visit [docker.com](https://www.docker.com/get-started) for installation instructions.
*   **(Optional) Portainer**: If you wish to manage the application using Portainer, ensure your Portainer instance is running and accessible.

## How to Run (Linux - Bash)

1.  **Prepare Files**:
    Ensure you have all the application files (`app.py`, `Dockerfile`, `requirements.txt`, `static/` directory, `templates/` directory) in your current directory. If you cloned a repository, navigate into it:
    ```bash
    # Example (if you had cloned from a Git repository):
    # git clone <repository_url>
    # cd <repository_directory>
    ```
    For this project, ensure all necessary files are present in the directory where you run the commands.

2.  **Build the Docker Image**:
    Open your terminal and run the following command from the directory containing the `Dockerfile` and other application files:
    ```bash
    docker build -t watch-together-app .
    ```
    This command builds a Docker image named `watch-together-app` using the `Dockerfile` in the current directory (`.`).

3.  **Run the Docker Container**:
    Once the image is built, run the container using:
    ```bash
    docker run -d -p 5000:5000 --name watch-together watch-together-app
    ```
    *   `-d`: Runs the container in detached mode (in the background).
    *   `-p 5000:5000`: Maps port `5000` on your host machine to port `5000` inside the container (host_port:container_port).
    *   `--name watch-together`: Assigns a memorable name (`watch-together`) to your container for easier management.
    *   `watch-together-app`: Specifies the image to run.

4.  **Accessing the Application**:
    Open your web browser and navigate to:
    ```
    http://localhost:5000
    ```

5.  **Stopping the Container**:
    To stop the application, run:
    ```bash
    docker stop watch-together
    ```

6.  **Removing the Container**:
    To remove the container (e.g., to run a new one or clean up):
    ```bash
    docker rm watch-together
    ```

## How to Run (Using Portainer)

This guide assumes you have already built the Docker image locally using the "How to Run (Linux - Bash)" method (Step 2), resulting in an image named `watch-together-app`.

1.  **Step 1: Ensure Image is Available Locally**
    *   After building the image `watch-together-app` using the Docker CLI as described above, Portainer (if managing the same Docker instance) will automatically see this local image.
    *   *(Alternative: If the image were on a remote registry like Docker Hub, you would navigate to "Images" in Portainer, click "Add image", enter `your_dockerhub_username/watch-together-app:latest` in the "Image" field, select the registry, and click "Pull the image".)*

2.  **Step 2: Deploy Container from Local Image**
    *   Navigate to **Containers** in your Portainer instance.
    *   Click **+ Add container**.
    *   **Name**: Enter a descriptive name, e.g., `youtube-watch-together`.
    *   **Image**: Enter the name of the locally built image. This will be `watch-together-app` or `watch-together-app:latest`.
    *   **Manual network port publishing**: Scroll down and click **Publish a new network port**.
        *   **Host**: Enter `5000`.
        *   **Container**: Enter `5000`.
        *   Ensure the protocol is **TCP**.
    *   **Restart Policy**: (Recommended)
        *   Navigate to the **Restart policy** tab (often found under "Advanced container settings" or similar, depending on Portainer version).
        *   Select a policy like **Unless stopped** or **Always** to ensure the container restarts automatically if it stops or if Docker restarts.
    *   **Deploy**: Click **Deploy the container**.

3.  **Step 3: Accessing the Application**
    *   Once deployed, the container will appear in the "Containers" list.
    *   Portainer often makes the published port clickable. You can click on the `5000` (or similar) link in the "Published Ports" column.
    *   Alternatively, open your web browser and navigate to `http://<your_portainer_host_ip>:5000`. If Portainer is running on the same machine you are accessing it from, this will usually be `http://localhost:5000`.

## Project Structure
```
.
├── app.py                # Main Flask application and SocketIO logic
├── Dockerfile            # Instructions to build the Docker image
├── requirements.txt      # Python dependencies
├── static/               # CSS and JavaScript files
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── script.js
└── templates/            # HTML templates
    └── index.html
```

## Troubleshooting
*   **Ensure Docker is running**: Check that the Docker service/daemon is active on your system.
*   **Port Conflicts**: If not using Portainer, ensure port `5000` on your host machine is not already in use by another application. You can check this with commands like `netstat -tulnp | grep 5000` (Linux) or by using Resource Monitor (Windows). If it is, you can map to a different host port, e.g., `docker run -p 5001:5000 ...` and access on `http://localhost:5001`.
*   **View Container Logs**:
    *   **Docker CLI**: `docker logs watch-together`
    *   **Portainer**: Navigate to your container in Portainer and click on the "Logs" icon/button. This will show you the output from the application running inside the container, which is helpful for diagnosing issues.
*   **Image Not Found (Portainer)**: If Portainer cannot find the image `watch-together-app`, ensure you successfully built it using the Docker CLI command `docker build -t watch-together-app .` on the same Docker host that Portainer is managing. You can verify this by running `docker images` in your terminal.
```
