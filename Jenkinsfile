pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        APP_SERVER = '18.61.177.110'
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
                    echo "Jenkins workspace:"
                    pwd

                    echo "Repository contents:"
                    ls -la

                    test -d frontend
                    test -d backend
                    test -f frontend/Dockerfile
                    test -f backend/Dockerfile
                '''
            }
        }

        stage('Verify SSH Connection') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
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
                                git clone '${GIT_REPOSITORY}' '${APP_DIR}'
                            fi

                            cd '${APP_DIR}'

                            git fetch origin '${GIT_BRANCH}'
                            git checkout '${GIT_BRANCH}'
                            git reset --hard 'origin/${GIT_BRANCH}'

                            echo 'Latest source code:'
                            git log -1 --oneline

                            test -f backend/.env
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

                            echo 'Building backend image'
                            docker build \
                              -t '${BACKEND_IMAGE}:${BUILD_NUMBER}' \
                              -t '${BACKEND_IMAGE}:latest' \
                              ./backend

                            echo 'Building frontend image'
                            docker build \
                              -t '${FRONTEND_IMAGE}:${BUILD_NUMBER}' \
                              -t '${FRONTEND_IMAGE}:latest' \
                              ./frontend

                            echo 'Docker images built successfully'
                            docker images | grep -E 'blog-backend|blog-frontend'
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

                            docker network inspect '${DOCKER_NETWORK}' \
                              >/dev/null 2>&1 \
                              || docker network create '${DOCKER_NETWORK}'

                            docker rm -f '${BACKEND_CONTAINER}' \
                              >/dev/null 2>&1 || true

                            docker run -d \
                              --name '${BACKEND_CONTAINER}' \
                              --restart unless-stopped \
                              --network '${DOCKER_NETWORK}' \
                              --env-file backend/.env \
                              -p 5000:5000 \
                              '${BACKEND_IMAGE}:${BUILD_NUMBER}'
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
                                    exit 0
                                fi

                                echo \"Waiting for backend: attempt \\$ATTEMPT\"
                                ATTEMPT=\\$((ATTEMPT + 1))
                                sleep 5
                            done

                            echo 'Backend health check failed'
                            docker logs --tail 100 '${BACKEND_CONTAINER}'
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

                            docker rm -f '${FRONTEND_CONTAINER}' \
                              >/dev/null 2>&1 || true

                            docker run -d \
                              --name '${FRONTEND_CONTAINER}' \
                              --restart unless-stopped \
                              --network '${DOCKER_NETWORK}' \
                              -p 8080:80 \
                              '${FRONTEND_IMAGE}:${BUILD_NUMBER}'
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
                                if curl -fsS http://localhost:8080/api/posts \
                                  >/dev/null; then
                                    echo 'Frontend and API verification successful'
                                    docker ps --filter name=blog-
                                    exit 0
                                fi

                                echo \"Waiting for application: attempt \\$ATTEMPT\"
                                ATTEMPT=\\$((ATTEMPT + 1))
                                sleep 5
                            done

                            echo 'Application verification failed'

                            echo 'Frontend logs:'
                            docker logs --tail 100 '${FRONTEND_CONTAINER}' || true

                            echo 'Backend logs:'
                            docker logs --tail 100 '${BACKEND_CONTAINER}' || true

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
            echo 'Application: http://18.61.177.110:8080'
        }

        failure {
            echo 'BlogReact deployment failed. Check the failed stage and Console Output.'
        }

        always {
            echo "Jenkins build number: ${BUILD_NUMBER}"
        }
    }
}
