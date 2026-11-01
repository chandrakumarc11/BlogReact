pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        APP_SERVER = '40.192.68.43'
        APP_USER = 'ubuntu'
        APP_DIR = '/home/ubuntu/BlogReact'

        SSH_CREDENTIAL_ID = 'app-ec2-ssh'

        GIT_REPOSITORY = 'https://github.com/chandrakumarc11/BlogReact.git'
        GIT_BRANCH = 'main'

        DOCKER_NETWORK = 'blog-network'

        BACKEND_IMAGE = 'blog-backend'
        FRONTEND_IMAGE = 'blog-frontend'

        BACKEND_CONTAINER = 'blog-backend-test'
        FRONTEND_CONTAINER = 'blog-frontend'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm

                sh '''
                    set -e

                    echo "Jenkins workspace:"
                    pwd

                    echo "Repository contents:"
                    ls -la

                    echo "Validating project files:"
                    test -d frontend
                    test -d backend
                    test -f frontend/Dockerfile
                    test -f backend/Dockerfile

                    echo "Project structure validation successful"
                '''
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    def scannerHome = tool 'SonarScanner'

                    withSonarQubeEnv('SonarQube') {
                        sh """
                            set -e

                            echo "Starting SonarQube analysis"

                            ${scannerHome}/bin/sonar-scanner \
                              -Dsonar.projectKey=BlogReact \
                              -Dsonar.projectName=BlogReact \
                              -Dsonar.sources=. \
                              -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/coverage/**

                            echo "SonarQube analysis completed"
                        """
                    }
                }
            }
        }

	stage('SonarQube Quality Gate') {
    steps {
        timeout(time: 5, unit: 'MINUTES') {
            waitForQualityGate abortPipeline: true
        }
    }
}
        stage('Verify SSH Connection') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -e

                        ssh \
                          -o BatchMode=yes \
                          -o StrictHostKeyChecking=no \
                          -o ConnectTimeout=10 \
                          ${APP_USER}@${APP_SERVER} \
                          "echo 'SSH connection successful'; hostname"
                    '''
                }
            }
        }

        stage('Update Source on Application EC2') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            if [ ! -d '${APP_DIR}/.git' ]; then
                                echo 'Repository not found. Cloning repository.'

                                git clone \
                                  '${GIT_REPOSITORY}' \
                                  '${APP_DIR}'
                            fi

                            cd '${APP_DIR}'

                            echo 'Fetching latest source code'

                            git fetch origin '${GIT_BRANCH}'
                            git checkout '${GIT_BRANCH}'
                            git reset --hard 'origin/${GIT_BRANCH}'

                            echo 'Latest source code:'
                            git log -1 --oneline

                            echo 'Checking backend environment file'
                            test -f backend/.env

                            echo 'Application source update successful'
                          "
                    '''
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            cd '${APP_DIR}'

                            echo 'Building backend Docker image'

                            docker build --pull \
                              -t '${BACKEND_IMAGE}:${BUILD_NUMBER}' \
                              -t '${BACKEND_IMAGE}:latest' \
                              ./backend

                            echo 'Building frontend Docker image'

                            docker build --pull \
                              -t '${FRONTEND_IMAGE}:${BUILD_NUMBER}' \
                              -t '${FRONTEND_IMAGE}:latest' \
                              ./frontend

                            echo 'Docker images built successfully'

                            docker images \
                              --format '{{.Repository}}:{{.Tag}}' \
                              | grep -E 'blog-backend|blog-frontend'
                          "
                    '''
                }
            }
        }

        stage('Trivy Security Scan') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            echo 'Pulling Trivy Docker image'

                            docker pull aquasec/trivy:latest

                            echo '===== Trivy Backend Image Scan ====='

                            docker run --rm \
                              -v /var/run/docker.sock:/var/run/docker.sock \
                              -v trivy-cache:/root/.cache/ \
                              aquasec/trivy:latest \
                              image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --ignore-unfixed \
                              --exit-code 1 \
                              '${BACKEND_IMAGE}:${BUILD_NUMBER}'

                            echo 'Backend image security scan passed'

                            echo '===== Trivy Frontend Image Scan ====='

                            docker run --rm \
                              -v /var/run/docker.sock:/var/run/docker.sock \
                              -v trivy-cache:/root/.cache/ \
                              aquasec/trivy:latest \
                              image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --ignore-unfixed \
                              --exit-code 1 \
                              '${FRONTEND_IMAGE}:${BUILD_NUMBER}'

                            echo 'Frontend image security scan passed'
                            echo 'All Trivy scans completed successfully'
                          "
                    '''
                }
            }
        }

        stage('Deploy Backend') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            cd '${APP_DIR}'

                            echo 'Checking Docker network'

                            docker network inspect '${DOCKER_NETWORK}' \
                              >/dev/null 2>&1 \
                              || docker network create '${DOCKER_NETWORK}'

                            echo 'Removing previous backend container'

                            docker rm -f '${BACKEND_CONTAINER}' \
                              >/dev/null 2>&1 || true

                            echo 'Starting backend container'

                            docker run -d \
                              --name '${BACKEND_CONTAINER}' \
                              --restart unless-stopped \
                              --network '${DOCKER_NETWORK}' \
                              --env-file backend/.env \
                              -p 5000:5000 \
                              '${BACKEND_IMAGE}:${BUILD_NUMBER}'

                            echo 'Backend container started'
                          "
                    '''
                }
            }
        }

        stage('Backend Health Check') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            ATTEMPT=1

                            while [ \\$ATTEMPT -le 12 ]; do
                                if curl -fsS http://localhost:5000/healthz; then
                                    echo
                                    echo 'Backend health check successful'
                                    docker ps \
                                      --filter name='${BACKEND_CONTAINER}'
                                    exit 0
                                fi

                                echo \"Waiting for backend: attempt \\$ATTEMPT of 12\"

                                ATTEMPT=\\$((ATTEMPT + 1))
                                sleep 5
                            done

                            echo 'Backend health check failed'

                            echo 'Backend container status:'
                            docker ps -a \
                              --filter name='${BACKEND_CONTAINER}'

                            echo 'Backend container logs:'
                            docker logs \
                              --tail 100 \
                              '${BACKEND_CONTAINER}' || true

                            exit 1
                          "
                    '''
                }
            }
        }

        stage('Deploy Frontend') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            echo 'Removing previous frontend container'

                            docker rm -f '${FRONTEND_CONTAINER}' \
                              >/dev/null 2>&1 || true

                            echo 'Starting frontend container'

                            docker run -d \
                              --name '${FRONTEND_CONTAINER}' \
                              --restart unless-stopped \
                              --network '${DOCKER_NETWORK}' \
                              -p 8080:80 \
                              '${FRONTEND_IMAGE}:${BUILD_NUMBER}'

                            echo 'Frontend container started'
                          "
                    '''
                }
            }
        }

        stage('Application Verification') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o StrictHostKeyChecking=no \
                          ${APP_USER}@${APP_SERVER} "
                            set -e

                            ATTEMPT=1

                            while [ \\$ATTEMPT -le 12 ]; do
                                if curl -fsS \
                                  http://localhost:8080/api/posts \
                                  >/dev/null; then

                                    echo 'Frontend and API verification successful'

                                    echo 'Running application containers:'
                                    docker ps \
                                      --filter name=blog-

                                    exit 0
                                fi

                                echo \"Waiting for application: attempt \\$ATTEMPT of 12\"

                                ATTEMPT=\\$((ATTEMPT + 1))
                                sleep 5
                            done

                            echo 'Application verification failed'

                            echo 'Frontend container status:'
                            docker ps -a \
                              --filter name='${FRONTEND_CONTAINER}'

                            echo 'Frontend logs:'
                            docker logs \
                              --tail 100 \
                              '${FRONTEND_CONTAINER}' || true

                            echo 'Backend container status:'
                            docker ps -a \
                              --filter name='${BACKEND_CONTAINER}'

                            echo 'Backend logs:'
                            docker logs \
                              --tail 100 \
                              '${BACKEND_CONTAINER}' || true

                            exit 1
                          "
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'BlogReact deployment completed successfully'
            echo 'Application: http://40.192.68.43:8080'
        }

        failure {
            echo 'BlogReact deployment failed.'
            echo 'Check the failed stage and Jenkins Console Output.'
        }

        always {
            echo "Jenkins build number: ${BUILD_NUMBER}"
            echo "Jenkins build result: ${currentBuild.currentResult}"
        }
    }
}
