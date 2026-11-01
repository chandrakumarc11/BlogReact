pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        skipDefaultCheckout(true)
        timeout(time: 45, unit: 'MINUTES')
    }

    environment {
        /*
         * Application EC2
         */
        APP_SERVER = '40.192.68.43'
        APP_USER = 'ubuntu'
        APP_DIR = '/home/ubuntu/BlogReact'
        SSH_CREDENTIAL_ID = 'app-ec2-ssh'

        /*
         * Git
         */
        GIT_REPOSITORY = 'https://github.com/chandrakumarc11/BlogReact.git'
        GIT_BRANCH = 'main'

        /*
         * Local Docker image names
         */
        BACKEND_IMAGE = 'blog-backend'
        FRONTEND_IMAGE = 'blog-frontend'

        /*
         * AWS and Amazon ECR
         */
        AWS_REGION = 'ap-south-2'
        AWS_ACCOUNT_ID = '079960139717'
        ECR_REGISTRY = '079960139717.dkr.ecr.ap-south-2.amazonaws.com'
        ECR_BACKEND_REPO = 'blog-backend'
        ECR_FRONTEND_REPO = 'blog-frontend'

        /*
         * Amazon EKS
         */
        EKS_CLUSTER = 'blogreact-eks'
        K8S_NAMESPACE = 'blogapp'
        BACKEND_DEPLOYMENT = 'blog-backend'
        FRONTEND_DEPLOYMENT = 'blog-frontend'
        FRONTEND_SERVICE = 'blog-frontend-service'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm

                sh '''
                    set -eu

                    echo "===== Jenkins Workspace ====="
                    pwd

                    echo "===== Repository Contents ====="
                    ls -la

                    echo "===== Validating Project Structure ====="

                    test -d frontend
                    test -d backend
                    test -d k8s
                    test -d eks

                    test -f frontend/Dockerfile
                    test -f backend/Dockerfile
                    test -f frontend/nginx.conf

                    test -f k8s/backend-deployment.yaml
                    test -f k8s/backend-service.yaml
                    test -f k8s/frontend-deployment.yaml
                    test -f k8s/frontend-service.yaml

                    echo "Project structure validation successful"
                '''
            }
        }

        stage('Verify SSH Connection') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o BatchMode=yes \
                          -o StrictHostKeyChecking=no \
                          -o ConnectTimeout=10 \
                          "${APP_USER}@${APP_SERVER}" \
                          "echo 'SSH connection successful'; hostname"
                    '''
                }
            }
        }

        stage('Update Source on Application EC2') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "APP_DIR='${APP_DIR}' \
                           GIT_REPOSITORY='${GIT_REPOSITORY}' \
                           GIT_BRANCH='${GIT_BRANCH}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            if [ ! -d "${APP_DIR}/.git" ]; then
                                echo "Repository not found. Cloning repository."

                                git clone \
                                  "${GIT_REPOSITORY}" \
                                  "${APP_DIR}"
                            fi

                            cd "${APP_DIR}"

                            echo "===== Fetching Latest Source ====="

                            git fetch origin "${GIT_BRANCH}"
                            git checkout "${GIT_BRANCH}"
                            git reset --hard "origin/${GIT_BRANCH}"

                            echo "===== Latest Commit ====="
                            git log -1 --oneline

                            echo "===== Validating Required Configuration ====="

                            test -f backend/.env
                            test -f frontend/Dockerfile
                            test -f backend/Dockerfile
                            test -f frontend/nginx.conf

                            grep -q "blog-backend-service:5000" \
                              frontend/nginx.conf

                            echo "Application source update successful"
REMOTE
                    '''
                }
            }
        }

        stage('Build and Test') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "APP_DIR='${APP_DIR}' bash -s" <<'REMOTE'
                            set -eu

                            cd "${APP_DIR}"

                            echo "===== Backend Dependency and Test Validation ====="

                            cd backend
                            npm ci
                            npm test --if-present
                            node --check src/server.js

                            echo "===== Frontend Build and Test Validation ====="

                            cd ../frontend
                            npm ci
                            npm test --if-present
                            npm run build

                            echo "Build and test validation successful"
REMOTE
                    '''
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    def scannerHome = tool 'SonarScanner'

                    withSonarQubeEnv('SonarQube') {
                        sh """
                            set -eu

                            echo "===== Starting SonarQube Analysis ====="

                            ${scannerHome}/bin/sonar-scanner \
                              -Dsonar.projectKey=BlogReact \
                              -Dsonar.projectName=BlogReact \
                              -Dsonar.sources=. \
                              -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/coverage/**

                            echo "SonarQube analysis upload completed"
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

        stage('Build Docker Images') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "APP_DIR='${APP_DIR}' \
                           BACKEND_IMAGE='${BACKEND_IMAGE}' \
                           FRONTEND_IMAGE='${FRONTEND_IMAGE}' \
                           BUILD_NUMBER='${BUILD_NUMBER}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            cd "${APP_DIR}"

                            echo "===== Building Backend Docker Image ====="

                            docker build --pull \
                              -t "${BACKEND_IMAGE}:${BUILD_NUMBER}" \
                              -t "${BACKEND_IMAGE}:latest" \
                              ./backend

                            echo "===== Building Frontend Docker Image ====="

                            docker build --pull \
                              -t "${FRONTEND_IMAGE}:${BUILD_NUMBER}" \
                              -t "${FRONTEND_IMAGE}:latest" \
                              ./frontend

                            echo "===== Verifying Versioned Images ====="

                            docker image inspect \
                              "${BACKEND_IMAGE}:${BUILD_NUMBER}" \
                              >/dev/null

                            docker image inspect \
                              "${FRONTEND_IMAGE}:${BUILD_NUMBER}" \
                              >/dev/null

                            echo "Docker image build completed successfully"
REMOTE
                    '''
                }
            }
        }

        stage('Trivy Security Scan') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "BACKEND_IMAGE='${BACKEND_IMAGE}' \
                           FRONTEND_IMAGE='${FRONTEND_IMAGE}' \
                           BUILD_NUMBER='${BUILD_NUMBER}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            echo "===== Pulling Trivy Image ====="

                            docker pull aquasec/trivy:latest

                            echo "===== Trivy Backend Scan ====="

                            docker run --rm \
                              -v /var/run/docker.sock:/var/run/docker.sock \
                              -v trivy-cache:/root/.cache/ \
                              aquasec/trivy:latest \
                              image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --ignore-unfixed \
                              --exit-code 1 \
                              "${BACKEND_IMAGE}:${BUILD_NUMBER}"

                            echo "Backend Trivy scan passed"

                            echo "===== Trivy Frontend Scan ====="

                            docker run --rm \
                              -v /var/run/docker.sock:/var/run/docker.sock \
                              -v trivy-cache:/root/.cache/ \
                              aquasec/trivy:latest \
                              image \
                              --scanners vuln \
                              --severity HIGH,CRITICAL \
                              --ignore-unfixed \
                              --exit-code 1 \
                              "${FRONTEND_IMAGE}:${BUILD_NUMBER}"

                            echo "Frontend Trivy scan passed"
                            echo "All security scans completed successfully"
REMOTE
                    '''
                }
            }
        }

        stage('Push Images to Amazon ECR') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "AWS_REGION='${AWS_REGION}' \
                           AWS_ACCOUNT_ID='${AWS_ACCOUNT_ID}' \
                           ECR_REGISTRY='${ECR_REGISTRY}' \
                           ECR_BACKEND_REPO='${ECR_BACKEND_REPO}' \
                           ECR_FRONTEND_REPO='${ECR_FRONTEND_REPO}' \
                           BACKEND_IMAGE='${BACKEND_IMAGE}' \
                           FRONTEND_IMAGE='${FRONTEND_IMAGE}' \
                           BUILD_NUMBER='${BUILD_NUMBER}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            echo "===== Verifying AWS IAM Identity ====="
                            aws sts get-caller-identity

                            echo "===== Verifying ECR Repositories ====="

                            aws ecr describe-repositories \
                              --region "${AWS_REGION}" \
                              --repository-names \
                                "${ECR_BACKEND_REPO}" \
                                "${ECR_FRONTEND_REPO}" \
                              >/dev/null

                            echo "===== Amazon ECR Login ====="

                            aws ecr get-login-password \
                              --region "${AWS_REGION}" \
                            | docker login \
                              --username AWS \
                              --password-stdin "${ECR_REGISTRY}"

                            echo "===== Tagging Versioned Images ====="

                            docker tag \
                              "${BACKEND_IMAGE}:${BUILD_NUMBER}" \
                              "${ECR_REGISTRY}/${ECR_BACKEND_REPO}:${BUILD_NUMBER}"

                            docker tag \
                              "${FRONTEND_IMAGE}:${BUILD_NUMBER}" \
                              "${ECR_REGISTRY}/${ECR_FRONTEND_REPO}:${BUILD_NUMBER}"

                            echo "===== Pushing Backend Image ====="

                            docker push \
                              "${ECR_REGISTRY}/${ECR_BACKEND_REPO}:${BUILD_NUMBER}"

                            echo "===== Pushing Frontend Image ====="

                            docker push \
                              "${ECR_REGISTRY}/${ECR_FRONTEND_REPO}:${BUILD_NUMBER}"

                            echo "===== Verifying Backend Tag in ECR ====="

                            aws ecr describe-images \
                              --repository-name "${ECR_BACKEND_REPO}" \
                              --image-ids imageTag="${BUILD_NUMBER}" \
                              --region "${AWS_REGION}" \
                              >/dev/null

                            echo "===== Verifying Frontend Tag in ECR ====="

                            aws ecr describe-images \
                              --repository-name "${ECR_FRONTEND_REPO}" \
                              --image-ids imageTag="${BUILD_NUMBER}" \
                              --region "${AWS_REGION}" \
                              >/dev/null

                            echo "ECR push and verification completed successfully"
REMOTE
                    '''
                }
            }
        }

        stage('Verify Amazon EKS Access') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "AWS_REGION='${AWS_REGION}' \
                           EKS_CLUSTER='${EKS_CLUSTER}' \
                           K8S_NAMESPACE='${K8S_NAMESPACE}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            echo "===== Updating EKS kubeconfig ====="

                            aws eks update-kubeconfig \
                              --region "${AWS_REGION}" \
                              --name "${EKS_CLUSTER}"

                            echo "===== Verifying EKS Nodes ====="
                            kubectl get nodes

                            echo "===== Verifying Existing Deployments ====="
                            kubectl get deployments \
                              -n "${K8S_NAMESPACE}"

                            echo "Amazon EKS access verification successful"
REMOTE
                    '''
                }
            }
        }

        stage('Deploy Backend to Amazon EKS') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "ECR_REGISTRY='${ECR_REGISTRY}' \
                           ECR_BACKEND_REPO='${ECR_BACKEND_REPO}' \
                           BACKEND_DEPLOYMENT='${BACKEND_DEPLOYMENT}' \
                           K8S_NAMESPACE='${K8S_NAMESPACE}' \
                           BUILD_NUMBER='${BUILD_NUMBER}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            BACKEND_TARGET_IMAGE="${ECR_REGISTRY}/${ECR_BACKEND_REPO}:${BUILD_NUMBER}"

                            echo "===== Deploying Backend Image ====="
                            echo "Backend image: ${BACKEND_TARGET_IMAGE}"

                            kubectl set image \
                              "deployment/${BACKEND_DEPLOYMENT}" \
                              "backend=${BACKEND_TARGET_IMAGE}" \
                              -n "${K8S_NAMESPACE}"

                            echo "===== Waiting for Backend Rolling Update ====="

                            if ! kubectl rollout status \
                              "deployment/${BACKEND_DEPLOYMENT}" \
                              -n "${K8S_NAMESPACE}" \
                              --timeout=180s; then

                                echo "Backend rollout failed"
                                echo "===== Backend Pods ====="

                                kubectl get pods \
                                  -n "${K8S_NAMESPACE}" \
                                  -l app=blog-backend \
                                  -o wide || true

                                echo "===== Backend Deployment Description ====="

                                kubectl describe \
                                  "deployment/${BACKEND_DEPLOYMENT}" \
                                  -n "${K8S_NAMESPACE}" || true

                                echo "===== Backend Recent Logs ====="

                                kubectl logs \
                                  "deployment/${BACKEND_DEPLOYMENT}" \
                                  -n "${K8S_NAMESPACE}" \
                                  --tail=100 || true

                                exit 1
                            fi

                            echo "Backend rolling deployment completed successfully"
REMOTE
                    '''
                }
            }
        }

        stage('Validate Backend Deployment') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "K8S_NAMESPACE='${K8S_NAMESPACE}' bash -s" <<'REMOTE'
                            set -eu

                            echo "===== Backend Deployment Status ====="

                            kubectl get deployment blog-backend \
                              -n "${K8S_NAMESPACE}"

                            echo "===== Backend Pods ====="

                            kubectl get pods \
                              -n "${K8S_NAMESPACE}" \
                              -l app=blog-backend \
                              -o wide

                            echo "===== Backend Internal API Test ====="

                            kubectl run "backend-test-${RANDOM}" \
                              --rm \
                              -i \
                              --restart=Never \
                              --image=curlimages/curl \
                              -n "${K8S_NAMESPACE}" \
                              -- \
                              curl \
                                --fail \
                                --silent \
                                --show-error \
                                --max-time 30 \
                                http://blog-backend-service:5000/api/posts \
                              >/dev/null

                            echo "Backend service and RDS validation successful"
REMOTE
                    '''
                }
            }
        }

        stage('Deploy Frontend to Amazon EKS') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "ECR_REGISTRY='${ECR_REGISTRY}' \
                           ECR_FRONTEND_REPO='${ECR_FRONTEND_REPO}' \
                           FRONTEND_DEPLOYMENT='${FRONTEND_DEPLOYMENT}' \
                           K8S_NAMESPACE='${K8S_NAMESPACE}' \
                           BUILD_NUMBER='${BUILD_NUMBER}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            FRONTEND_TARGET_IMAGE="${ECR_REGISTRY}/${ECR_FRONTEND_REPO}:${BUILD_NUMBER}"

                            echo "===== Deploying Frontend Image ====="
                            echo "Frontend image: ${FRONTEND_TARGET_IMAGE}"

                            kubectl set image \
                              "deployment/${FRONTEND_DEPLOYMENT}" \
                              "frontend=${FRONTEND_TARGET_IMAGE}" \
                              -n "${K8S_NAMESPACE}"

                            echo "===== Waiting for Frontend Rolling Update ====="

                            if ! kubectl rollout status \
                              "deployment/${FRONTEND_DEPLOYMENT}" \
                              -n "${K8S_NAMESPACE}" \
                              --timeout=180s; then

                                echo "Frontend rollout failed"
                                echo "===== Frontend Pods ====="

                                kubectl get pods \
                                  -n "${K8S_NAMESPACE}" \
                                  -l app=blog-frontend \
                                  -o wide || true

                                echo "===== Frontend Deployment Description ====="

                                kubectl describe \
                                  "deployment/${FRONTEND_DEPLOYMENT}" \
                                  -n "${K8S_NAMESPACE}" || true

                                echo "===== Frontend Recent Logs ====="

                                kubectl logs \
                                  "deployment/${FRONTEND_DEPLOYMENT}" \
                                  -n "${K8S_NAMESPACE}" \
                                  --tail=100 || true

                                exit 1
                            fi

                            echo "Frontend rolling deployment completed successfully"
REMOTE
                    '''
                }
            }
        }

        stage('Validate EKS Application') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "K8S_NAMESPACE='${K8S_NAMESPACE}' \
                           FRONTEND_SERVICE='${FRONTEND_SERVICE}' \
                           BACKEND_DEPLOYMENT='${BACKEND_DEPLOYMENT}' \
                           FRONTEND_DEPLOYMENT='${FRONTEND_DEPLOYMENT}' \
                           BUILD_NUMBER='${BUILD_NUMBER}' \
                           bash -s" <<'REMOTE'
                            set -eu

                            echo "===== Final Kubernetes Resources ====="

                            kubectl get deployments \
                              -n "${K8S_NAMESPACE}"

                            kubectl get pods \
                              -n "${K8S_NAMESPACE}" \
                              -o wide

                            kubectl get services \
                              -n "${K8S_NAMESPACE}"

                            echo "===== Verifying Deployment Images ====="

                            BACKEND_RUNNING_IMAGE=$(
                              kubectl get \
                                "deployment/${BACKEND_DEPLOYMENT}" \
                                -n "${K8S_NAMESPACE}" \
                                -o jsonpath='{.spec.template.spec.containers[0].image}'
                            )

                            FRONTEND_RUNNING_IMAGE=$(
                              kubectl get \
                                "deployment/${FRONTEND_DEPLOYMENT}" \
                                -n "${K8S_NAMESPACE}" \
                                -o jsonpath='{.spec.template.spec.containers[0].image}'
                            )

                            echo "Backend running image: ${BACKEND_RUNNING_IMAGE}"
                            echo "Frontend running image: ${FRONTEND_RUNNING_IMAGE}"

                            echo "${BACKEND_RUNNING_IMAGE}" \
                              | grep -q ":${BUILD_NUMBER}$"

                            echo "${FRONTEND_RUNNING_IMAGE}" \
                              | grep -q ":${BUILD_NUMBER}$"

                            echo "===== Resolving LoadBalancer Hostname ====="

                            ATTEMPT=1
                            LB_HOST=""

                            while [ "${ATTEMPT}" -le 18 ]; do
                                LB_HOST=$(
                                  kubectl get service \
                                    "${FRONTEND_SERVICE}" \
                                    -n "${K8S_NAMESPACE}" \
                                    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
                                )

                                if [ -n "${LB_HOST}" ]; then
                                    break
                                fi

                                echo "Waiting for LoadBalancer hostname: attempt ${ATTEMPT} of 18"

                                ATTEMPT=$((ATTEMPT + 1))
                                sleep 10
                            done

                            test -n "${LB_HOST}"

                            echo "Application LoadBalancer: http://${LB_HOST}"

                            echo "===== External Application Validation ====="

                            ATTEMPT=1

                            while [ "${ATTEMPT}" -le 18 ]; do
                                if curl \
                                  --fail \
                                  --silent \
                                  --show-error \
                                  --max-time 30 \
                                  "http://${LB_HOST}/" \
                                  >/dev/null \
                                && curl \
                                  --fail \
                                  --silent \
                                  --show-error \
                                  --max-time 30 \
                                  "http://${LB_HOST}/api/posts" \
                                  >/dev/null; then

                                    echo "External frontend validation successful"
                                    echo "External backend and RDS validation successful"
                                    echo "Application URL: http://${LB_HOST}"

                                    exit 0
                                fi

                                echo "Waiting for EKS application: attempt ${ATTEMPT} of 18"

                                ATTEMPT=$((ATTEMPT + 1))
                                sleep 10
                            done

                            echo "EKS application validation failed"

                            echo "===== Frontend Logs ====="

                            kubectl logs \
                              "deployment/${FRONTEND_DEPLOYMENT}" \
                              -n "${K8S_NAMESPACE}" \
                              --tail=100 || true

                            echo "===== Backend Logs ====="

                            kubectl logs \
                              "deployment/${BACKEND_DEPLOYMENT}" \
                              -n "${K8S_NAMESPACE}" \
                              --tail=100 || true

                            echo "===== Recent Namespace Events ====="

                            kubectl get events \
                              -n "${K8S_NAMESPACE}" \
                              --sort-by=.lastTimestamp || true

                            exit 1
REMOTE
                    '''
                }
            }
        }

        stage('Cleanup Old Docker Images') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        set -eu

                        ssh \
                          -o StrictHostKeyChecking=no \
                          "${APP_USER}@${APP_SERVER}" \
                          "bash -s" <<'REMOTE'
                            set -eu

                            echo "===== Docker Disk Usage Before Cleanup ====="
                            docker system df || true

                            echo "===== Removing Dangling Images ====="
                            docker image prune -f || true

                            echo "===== Docker Disk Usage After Cleanup ====="
                            docker system df || true
REMOTE
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'BlogReact CI/CD deployment to Amazon EKS completed successfully'
            echo "Backend ECR image: ${ECR_REGISTRY}/${ECR_BACKEND_REPO}:${BUILD_NUMBER}"
            echo "Frontend ECR image: ${ECR_REGISTRY}/${ECR_FRONTEND_REPO}:${BUILD_NUMBER}"
            echo "EKS cluster: ${EKS_CLUSTER}"
            echo "Kubernetes namespace: ${K8S_NAMESPACE}"
        }

        failure {
            echo 'BlogReact CI/CD deployment failed'
            echo 'Check the failed Jenkins stage and Console Output'
            echo 'The previous healthy Kubernetes ReplicaSet should remain available when the rolling update cannot become ready'
        }

        always {
            echo "Jenkins build number: ${BUILD_NUMBER}"
            echo "Jenkins build result: ${currentBuild.currentResult}"
        }
    }
}
